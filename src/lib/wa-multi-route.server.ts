// Server-only multi-route campaign worker.
// - Smooth Weighted Round-Robin (nginx) across active routes for a campaign.
// - Per-phone_number_id token bucket via wa_try_consume_token (shared with legacy).
// - Immutable attempt log in wa_campaign_attempts.
// - Recipient dedup via UNIQUE(campaign_id, phone) + skip when meta_message_id IS NOT NULL.
// - Recipient affinity via locked_route_id (kept during transient retries).
// - Template failover: Meta codes 132015 / 132016 / 132001 mark the route
//   `template_unavailable`, unlock its pending recipients, and notify.
// - Number failover: Meta codes 190 / 131057 / 131037 / 131045 / 368 / 131031
//   mark the route `number_unavailable`, unlock its pending recipients.
//
// Called from src/routes/api/public/whatsapp/queue-tick.tsx when
// wa_campaigns.use_multi_route is true.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplateMessage } from "@/lib/wa-send.server";
import { renderMapping, buildContext } from "@/lib/wa-variables";

const MAX_TICK_MS = 55 * 1000;
const LEASE_MS = 3 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DEFAULT_RATE = 6;
const DEFAULT_CONC = 15;

const RETRYABLE_CODES = new Set([
  "130429", "131000", "131016", "131026", "131056", "131048", "131047",
  "368", "500", "502", "503", "504",
]);
const TEMPLATE_FAIL_CODES = new Set(["132015", "132016", "132001", "132000", "132007", "132012"]);
const NUMBER_FAIL_CODES = new Set(["190", "131057", "131037", "131045", "131031"]);

type Route = {
  id: string;
  campaign_id: string;
  connection_id: string;
  phone_number_id: string;
  waba_ref_id: string | null;
  template_id: string;
  template_name: string;
  template_language: string;
  priority: number;
  weight: number;
  status: string;
  is_primary: boolean;
  rate_effective: number | null;
  max_concurrency: number | null;
  variables_mapping: any;
  button_url_mapping: any;
  swrr_current_weight: number;
};

type LoadedRoute = Route & {
  access_token: string;
  template: any;
  connection: any;
  in_flight: number;
  effective_weight: number;
};

async function logTimeline(campaignId: string, event_type: string, message: string, payload: any = {}) {
  try {
    await supabaseAdmin.from("campaign_timeline").insert({ campaign_id: campaignId, event_type, message, payload });
  } catch {}
}

async function acquireLease(campaignId: string): Promise<string | null> {
  const leaseId = crypto.randomUUID();
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const { data } = await supabaseAdmin
    .from("wa_campaigns")
    .update({ worker_lease_id: leaseId, worker_lease_until: until })
    .eq("id", campaignId)
    .or(`worker_lease_until.is.null,worker_lease_until.lt.${new Date().toISOString()}`)
    .select("id")
    .maybeSingle();
  return data ? leaseId : null;
}

async function releaseLease(campaignId: string) {
  await supabaseAdmin.from("wa_campaigns").update({ worker_lease_id: null, worker_lease_until: null }).eq("id", campaignId);
}

async function loadRoutes(campaignId: string): Promise<LoadedRoute[]> {
  const { data: routes } = await supabaseAdmin
    .from("wa_campaign_routes")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .order("priority", { ascending: true });
  if (!routes || routes.length === 0) return [];

  const connIds = Array.from(new Set(routes.map((r: any) => r.connection_id)));
  const tplIds = Array.from(new Set(routes.map((r: any) => r.template_id)));
  const [{ data: conns }, { data: tpls }] = await Promise.all([
    supabaseAdmin.from("whatsapp_connections").select("*").in("id", connIds),
    supabaseAdmin.from("whatsapp_templates").select("*").in("id", tplIds),
  ]);
  const connMap = new Map((conns ?? []).map((c: any) => [c.id, c]));
  const tplMap = new Map((tpls ?? []).map((t: any) => [t.id, t]));

  const loaded: LoadedRoute[] = [];
  for (const r of routes as any[]) {
    const conn = connMap.get(r.connection_id);
    const tpl = tplMap.get(r.template_id);
    if (!conn || !tpl) continue;
    const token = conn.access_token || process.env.WHATSAPP_ACCESS_TOKEN || "";
    if (!token) continue;
    if (String(tpl.status ?? "").toUpperCase() !== "APPROVED") {
      await failoverRoute(r.id, r.campaign_id, "template_unavailable", `Template não aprovado (${tpl.status})`, "template_precheck");
      continue;
    }
    const eff = Math.max(1, Number(r.rate_effective || conn.rate_per_second || DEFAULT_RATE));
    loaded.push({
      ...(r as Route),
      access_token: token,
      template: tpl,
      connection: conn,
      in_flight: 0,
      effective_weight: r.weight > 0 ? r.weight : eff,
    });
  }
  return loaded;
}

async function failoverRoute(routeId: string, campaignId: string, status: "template_unavailable" | "number_unavailable" | "rate_limited" | "disabled" | "paused", message: string, code: string) {
  await supabaseAdmin
    .from("wa_campaign_routes")
    .update({ status: status as any, last_error_code: code, last_error_message: message, last_error_at: new Date().toISOString(), disabled_reason: message })
    .eq("id", routeId);
  // Unlock pending recipients affine to this route so another route can pick them up.
  await supabaseAdmin
    .from("campaign_recipients")
    .update({ locked_route_id: null, route_id: null })
    .eq("locked_route_id", routeId)
    .eq("status", "pending");
  await logTimeline(campaignId, "route_failover", message, { route_id: routeId, code });
}

/** nginx smooth WRR — mutates each route's swrr_current_weight; returns picked route or null. */
function pickRouteSWRR(routes: LoadedRoute[]): LoadedRoute | null {
  const eligible = routes.filter((r) => {
    const cap = r.max_concurrency ?? DEFAULT_CONC;
    return r.in_flight < cap;
  });
  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];
  let total = 0;
  let best: LoadedRoute | null = null;
  for (const r of eligible) {
    r.swrr_current_weight += r.effective_weight;
    total += r.effective_weight;
    if (!best || r.swrr_current_weight > best.swrr_current_weight) best = r;
  }
  if (best) best.swrr_current_weight -= total;
  return best;
}

async function persistSWRRState(routes: LoadedRoute[]) {
  // Best-effort: persist swrr_current_weight so the next tick continues fairly.
  await Promise.all(
    routes.map((r) =>
      supabaseAdmin.from("wa_campaign_routes").update({ swrr_current_weight: r.swrr_current_weight }).eq("id", r.id),
    ),
  );
}

async function reserveRecipient(
  campaignId: string,
  routeId: string,
): Promise<any | null> {
  const nowIso = new Date().toISOString();
  // Prefer recipients already affine to this route (retries), else any free pending.
  const affineRes = await supabaseAdmin
    .from("campaign_recipients")
    .update({ status: "processing", last_attempt_at: nowIso, route_id: routeId, locked_route_id: routeId })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .eq("locked_route_id", routeId)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .is("meta_message_id", null)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (affineRes.data) return affineRes.data;

  const freeRes = await supabaseAdmin
    .from("campaign_recipients")
    .update({ status: "processing", last_attempt_at: nowIso, route_id: routeId, locked_route_id: routeId })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .is("locked_route_id", null)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .is("meta_message_id", null)
    .select("*")
    .limit(1)
    .maybeSingle();
  return freeRes.data ?? null;
}

async function recordAttempt(row: {
  campaign_id: string;
  recipient_id: string;
  route_id: string;
  phone_number_id: string;
  template_id: string;
  template_name: string;
  attempt_number: number;
  http_status?: number;
  meta_message_id?: string | null;
  message_status?: string | null;
  error_code?: string | null;
  error_details?: any;
  workspace_id?: string | null;
}) {
  try {
    await supabaseAdmin.from("wa_campaign_attempts").insert({
      campaign_id: row.campaign_id,
      recipient_id: row.recipient_id,
      route_id: row.route_id,
      phone_number_id: row.phone_number_id,
      template_id: row.template_id,
      template_name: row.template_name,
      attempt_number: row.attempt_number,
      http_status: row.http_status ?? null,
      meta_message_id: row.meta_message_id ?? null,
      message_status: row.message_status ?? null,
      error_code: row.error_code ?? null,
      error_details: row.error_details ?? null,
      workspace_id: row.workspace_id ?? null,
    });
  } catch {}
}

function buildVariables(
  rec: any,
  route: LoadedRoute,
  camp: any,
  clientRow: any,
  projectRow: any,
): Record<string, string> {
  const ctx = buildContext({
    contact: { name: rec.contact_name, phone: rec.phone, ...(rec.variables ?? {}) },
    client: clientRow,
    project: projectRow,
    campaign: camp,
    extra: rec.variables ?? {},
  } as any);
  const mapping: Record<string, string> = route.variables_mapping || camp.variables_mapping || {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(mapping)) {
    out[key] = renderMapping(String(val ?? ""), ctx);
  }
  return out;
}

/** Main entrypoint. Called by queue-tick for each running multi-route campaign. */
export async function processMultiRouteTick(campaignId: string, reservationBudget: number) {
  const started = Date.now();
  const lease = await acquireLease(campaignId);
  if (!lease) return { skipped: "lease_busy" };

  try {
    const { data: camp } = await supabaseAdmin.from("wa_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (!camp || camp.status !== "running") return { skipped: "not_running" };
    if (!(camp as any).use_multi_route) return { skipped: "not_multi_route" };

    const routes = await loadRoutes(campaignId);
    if (routes.length === 0) {
      await logTimeline(campaignId, "no_active_route", "Nenhuma rota ativa disponível", {});
      await supabaseAdmin.from("wa_campaigns").update({ pause_reason: "no_active_route" }).eq("id", campaignId);
      return { skipped: "no_active_route" };
    }

    const [{ data: clientRow }, { data: projectRow }] = await Promise.all([
      camp.client_id ? supabaseAdmin.from("clients").select("*").eq("id", camp.client_id).maybeSingle() : Promise.resolve({ data: null } as any),
      camp.project_id ? supabaseAdmin.from("projects").select("*").eq("id", camp.project_id).maybeSingle() : Promise.resolve({ data: null } as any),
    ]);

    let dispatched = 0;
    let failed = 0;
    const inFlight = new Set<Promise<void>>();

    // Load current attempt counts once per recipient dispatched.
    while (Date.now() - started < MAX_TICK_MS && dispatched + failed < reservationBudget) {
      // If no route has capacity right now, brief pause.
      const anyActive = routes.some((r) => r.status === "active");
      if (!anyActive) break;

      const picked = pickRouteSWRR(routes);
      if (!picked) {
        // All routes maxed on concurrency — wait for one to drain.
        await Promise.race([...inFlight, new Promise((r) => setTimeout(r, 100))]).catch(() => {});
        continue;
      }

      // Token bucket per phone_number_id (shared across campaigns).
      const rate = Math.max(1, Number(picked.rate_effective || picked.connection.rate_per_second || DEFAULT_RATE));
      const conc = Math.max(1, Number(picked.max_concurrency || DEFAULT_CONC));
      const { data: tokenRes } = await supabaseAdmin.rpc("wa_try_consume_token" as any, {
        _phone_number_id: picked.phone_number_id,
        _default_rate: rate,
        _default_conc: conc,
      });
      const bucket = Array.isArray(tokenRes) ? tokenRes[0] : tokenRes;
      if (!bucket?.allowed) {
        const wait = Math.max(10, Math.min(500, Number(bucket?.wait_ms ?? 100)));
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const rec = await reserveRecipient(campaignId, picked.id);
      if (!rec) {
        // Nothing to send for this route right now — try another route or exit.
        // Skip this route in the next iteration by temporarily reducing weight.
        picked.effective_weight = Math.max(1, Math.floor(picked.effective_weight / 2));
        // If every route has no work, exit.
        const anyWorkPossible = routes.some((r) => r.effective_weight > 1);
        if (!anyWorkPossible) break;
        continue;
      }

      picked.in_flight += 1;
      const attemptNumber = (rec.attempt ?? 0) + 1;
      const variables = buildVariables(rec, picked, camp, clientRow, projectRow);

      const p = (async () => {
        try {
          const res = await sendTemplateMessage({
            phoneNumberId: picked.phone_number_id,
            accessToken: picked.access_token,
            to: String(rec.phone).replace(/\D+/g, ""),
            templateName: picked.template_name,
            languageCode: picked.template_language,
            variables,
            headerType: picked.template?.header_type ?? null,
            headerValue: (variables as any)._header_image_url ?? null,
          });

          if (res.ok) {
            await supabaseAdmin
              .from("campaign_recipients")
              .update({
                status: "accepted",
                meta_message_id: res.wamid ?? res.metaMessageId ?? null,
                sent_at: new Date().toISOString(),
                attempt: attemptNumber,
                failed_reason: null,
                error_code: null,
              })
              .eq("id", rec.id);
            await supabaseAdmin.rpc("increment" as any, {}).catch(() => {});
            await supabaseAdmin
              .from("wa_campaign_routes")
              .update({ accepted_count: (picked as any).accepted_count = ((picked as any).accepted_count ?? 0) + 1 })
              .eq("id", picked.id);
            await recordAttempt({
              campaign_id: campaignId, recipient_id: rec.id, route_id: picked.id,
              phone_number_id: picked.phone_number_id, template_id: picked.template_id, template_name: picked.template_name,
              attempt_number: attemptNumber, http_status: res.httpStatus, meta_message_id: res.wamid ?? res.metaMessageId ?? null,
              message_status: res.messageStatus ?? "accepted", workspace_id: camp.workspace_id,
            });
            dispatched += 1;
          } else {
            const code = String((res as any).code ?? "");
            const retryable = RETRYABLE_CODES.has(code);
            const templateFail = TEMPLATE_FAIL_CODES.has(code);
            const numberFail = NUMBER_FAIL_CODES.has(code);
            const willRetry = retryable && attemptNumber < MAX_ATTEMPTS;
            await recordAttempt({
              campaign_id: campaignId, recipient_id: rec.id, route_id: picked.id,
              phone_number_id: picked.phone_number_id, template_id: picked.template_id, template_name: picked.template_name,
              attempt_number: attemptNumber, http_status: res.httpStatus, error_code: code, error_details: (res as any).raw ?? null,
              workspace_id: camp.workspace_id,
            });

            if (templateFail) {
              await failoverRoute(picked.id, campaignId, "template_unavailable", (res as any).error || `Meta ${code}`, code);
              // Return recipient to pending (unlocked) so another route may pick it up.
              await supabaseAdmin
                .from("campaign_recipients")
                .update({ status: "pending", locked_route_id: null, route_id: null, attempt: attemptNumber, next_attempt_at: new Date().toISOString() })
                .eq("id", rec.id);
            } else if (numberFail) {
              await failoverRoute(picked.id, campaignId, "number_unavailable", (res as any).error || `Meta ${code}`, code);
              await supabaseAdmin
                .from("campaign_recipients")
                .update({ status: "pending", locked_route_id: null, route_id: null, attempt: attemptNumber, next_attempt_at: new Date().toISOString() })
                .eq("id", rec.id);
            } else if (willRetry) {
              const backoffMs = Math.min(60_000, 1000 * Math.pow(2, attemptNumber)) + Math.floor(Math.random() * 500);
              await supabaseAdmin
                .from("campaign_recipients")
                .update({
                  status: "pending", attempt: attemptNumber,
                  next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
                  failed_reason: (res as any).error ?? null, error_code: code,
                })
                .eq("id", rec.id);
            } else {
              await supabaseAdmin
                .from("campaign_recipients")
                .update({
                  status: "failed", attempt: attemptNumber, failed_at: new Date().toISOString(),
                  failed_reason: (res as any).error ?? "erro Meta", error_code: code, next_attempt_at: null,
                })
                .eq("id", rec.id);
              await supabaseAdmin
                .from("wa_campaign_routes")
                .update({ failed_count: ((picked as any).failed_count ?? 0) + 1, last_error_code: code, last_error_message: (res as any).error ?? null, last_error_at: new Date().toISOString() })
                .eq("id", picked.id);
              failed += 1;
            }
          }
        } catch (e: any) {
          await recordAttempt({
            campaign_id: campaignId, recipient_id: rec.id, route_id: picked.id,
            phone_number_id: picked.phone_number_id, template_id: picked.template_id, template_name: picked.template_name,
            attempt_number: attemptNumber, error_code: "exception", error_details: { message: e?.message },
            workspace_id: camp.workspace_id,
          });
          await supabaseAdmin
            .from("campaign_recipients")
            .update({
              status: "pending", attempt: attemptNumber,
              next_attempt_at: new Date(Date.now() + 15_000).toISOString(),
              failed_reason: String(e?.message ?? "exception"),
            })
            .eq("id", rec.id);
        } finally {
          picked.in_flight -= 1;
        }
      })();
      inFlight.add(p);
      p.finally(() => inFlight.delete(p));
    }

    await Promise.allSettled(Array.from(inFlight));
    await persistSWRRState(routes);
    await supabaseAdmin.rpc("wa_recalc_campaign_progress" as any, { _campaign_id: campaignId });

    // If no route is left active, pause the campaign (until user intervenes).
    const anyLeftActive = (await supabaseAdmin
      .from("wa_campaign_routes")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "active")).count;
    if (!anyLeftActive) {
      await supabaseAdmin.from("wa_campaigns").update({ status: "paused", paused_at: new Date().toISOString(), pause_reason: "all_routes_failed" }).eq("id", campaignId);
    }

    return { ok: true, dispatched, failed, routes: routes.length };
  } finally {
    await releaseLease(campaignId);
  }
}
