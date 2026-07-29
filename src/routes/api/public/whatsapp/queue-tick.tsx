import { createFileRoute } from "@tanstack/react-router";

// URL estável do próprio endpoint (self-chain via pg_net).
// Publicada e preview usam project--{id}.lovable.app como fallback estável.
const PROJECT_ID = "9c7682d6-edcd-4388-a36c-36249d4d6ab8";
const FALLBACK_CHAIN_URL =
  process.env.WA_TICK_CHAIN_URL ||
  `https://project--${PROJECT_ID}.lovable.app/api/public/whatsapp/queue-tick`;
// Segredo interno usado para autenticar o self-chain (header `apikey`).
const CHAIN_APIKEY = process.env.WA_CRON_SECRET || "";

// Lease curto para self-chain contínuo: se uma execução cair, o próximo tick
// retoma em segundos, sem ficar preso até o próximo minuto.
const TICK_LEASE_SECONDS = 6;

export const Route = createFileRoute("/api/public/whatsapp/queue-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processCampaignTick } = await import("@/lib/wa-queue.server");

        const tickStartWall = Date.now();
        const source = request.headers.get("x-tick-source") || "cron";
        const holder = `${source}-${crypto.randomUUID()}`;
        const host = request.headers.get("host");
        const proto = request.headers.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
        const chainUrl = host
          ? new URL("/api/public/whatsapp/queue-tick", `${proto}://${host}`).toString()
          : FALLBACK_CHAIN_URL;

        // -------- Lease global: impede sobreposição entre cron e chain --------
        const { data: acquired } = await supabaseAdmin.rpc(
          "wa_tick_acquire_lease" as any,
          { _holder: holder, _duration_seconds: TICK_LEASE_SECONDS },
        );
        if (!acquired) {
          return Response.json({
            ok: true,
            skipped: true,
            reason: "tick_lease_active",
            source,
          });
        }
        let tickLeaseReleased = false;
        const releaseTickLeaseOnce = async () => {
          if (tickLeaseReleased) return;
          tickLeaseReleased = true;
          try {
            await supabaseAdmin.rpc("wa_tick_release_lease" as any, { _holder: holder });
          } catch { /* ignore */ }
        };

        try {
          const nowIso = new Date().toISOString();

          // Auto-heal de slots vazados.
          // GUARDA: só devolvemos capacidade quando é impossível haver
          // requisições em andamento — ou seja, wa_rate_limits está parado há
          // mais de 30s E não há campanha 'running' com lease de tick ativo
          // nesse número E não há recipients em 'processing' recentes.
          // Isso impede devolução de slots enquanto sends ainda estão em voo.
          try {
            const staleRateCutoff = new Date(Date.now() - 30 * 1000).toISOString();
            const { data: staleRates } = await supabaseAdmin
              .from("wa_rate_limits")
              .select("phone_number_id,rate_per_second")
              .lt("updated_at", staleRateCutoff)
              .gt("active_inflight", 0);
            for (const r of staleRates ?? []) {
              const phoneId = r.phone_number_id as string;
              // Existem recipients em 'processing' há pouco tempo neste número?
              const { data: conns } = await supabaseAdmin
                .from("whatsapp_connections")
                .select("id")
                .eq("phone_number_id", phoneId);
              const connIds = (conns ?? []).map((c: any) => c.id as string);
              let busy = false;
              if (connIds.length > 0) {
                const recentIso = new Date(Date.now() - 30 * 1000).toISOString();
                const { data: activeCamps } = await supabaseAdmin
                  .from("wa_campaigns")
                  .select("id")
                  .in("connection_id", connIds)
                  .eq("status", "running")
                  .gt("worker_lease_until", nowIso);
                if ((activeCamps?.length ?? 0) > 0) busy = true;
                if (!busy) {
                  const { count: procCount } = await supabaseAdmin
                    .from("campaign_recipients")
                    .select("id", { count: "exact", head: true })
                    .in("campaign_id", (activeCamps ?? []).map((c: any) => c.id) as any)
                    .eq("status", "processing")
                    .gte("last_attempt_at", recentIso);
                  if ((procCount ?? 0) > 0) busy = true;
                }
              }
              if (busy) continue;
              await supabaseAdmin
                .from("wa_rate_limits")
                .update({
                  active_inflight: 0,
                  tokens: r.rate_per_second ?? 0,
                  last_refill_at: nowIso,
                  updated_at: nowIso,
                })
                .eq("phone_number_id", phoneId);
            }
          } catch (err) {
            console.error("[queue-tick] rate-limit heal failed", err);
          }


          // Preflight validation of scheduled campaigns whose time has come
          const { data: due } = await supabaseAdmin
            .from("wa_campaigns")
            .select("id,workspace_id,connection_id,template_id,total_recipients,list_id,name")
            .eq("status", "scheduled")
            .lte("scheduled_at", nowIso);

          for (const camp of due ?? []) {
            const errors: string[] = [];
            if (!camp.connection_id) errors.push("Sem número de WhatsApp");
            if (!camp.template_id) errors.push("Sem template");
            if (!camp.total_recipients) errors.push("Sem destinatários");

            if (camp.connection_id) {
              const { data: conn } = await supabaseAdmin.from("whatsapp_connections")
                .select("status,access_token,phone_number_id")
                .eq("id", camp.connection_id).maybeSingle();
              if (!conn) errors.push("Número não encontrado");
              else if (conn.status && !["ativo", "active", "connected"].includes(String(conn.status).toLowerCase())) errors.push(`Número inativo (${conn.status})`);
              else if (!conn.phone_number_id) errors.push("phone_number_id ausente");
              else if (!conn.access_token && !process.env.WHATSAPP_ACCESS_TOKEN) errors.push("Token de acesso ausente (sem token global)");
            }
            if (camp.template_id) {
              const { data: tpl } = await supabaseAdmin.from("whatsapp_templates")
                .select("status,name").eq("id", camp.template_id).maybeSingle();
              if (!tpl) errors.push("Template não encontrado");
              else if (tpl.status && String(tpl.status).toUpperCase() !== "APPROVED") errors.push(`Template não aprovado (${tpl.status})`);
            }

            if (errors.length > 0) {
              const msg = errors.join(" · ");
              await supabaseAdmin.from("wa_campaigns")
                .update({ status: "error", last_error: msg, finished_at: nowIso })
                .eq("id", camp.id);
              try {
                await supabaseAdmin.from("campaign_timeline").insert({
                  campaign_id: camp.id, event_type: "preflight_failed", message: msg, payload: { errors },
                });
              } catch { /* ignore */ }
              if (camp.workspace_id) {
                try {
                  await supabaseAdmin.rpc("notify_workspace" as any, {
                    _ws: camp.workspace_id, _kind: "campaign.failed",
                    _title: "Falha ao iniciar campanha",
                    _body: `"${camp.name}": ${msg}`,
                    _link: "/painel/agenda", _severity: "error",
                    _metadata: { campaign_id: camp.id, errors },
                  });
                } catch { /* ignore */ }
              }
            } else {
              await supabaseAdmin.from("wa_campaigns")
                .update({ status: "running", started_at: nowIso })
                .eq("id", camp.id);
              if (camp.workspace_id) {
                try {
                  await supabaseAdmin.rpc("notify_workspace" as any, {
                    _ws: camp.workspace_id, _kind: "campaign.started",
                    _title: "Campanha iniciada",
                    _body: `"${camp.name}" começou.`,
                    _link: "/painel/agenda", _severity: "info",
                    _metadata: { campaign_id: camp.id },
                  });
                } catch { /* ignore */ }
              }
            }
          }

          // Auto-retomar campanhas pausadas por erro de rede após 1 min
          await supabaseAdmin
            .from("wa_campaigns")
            .update({ status: "running", pause_reason: null, paused_at: null, scheduled_at: null })
            .eq("status", "paused")
            .eq("pause_reason", "network_errors")
            .lte("paused_at", new Date(Date.now() - 60 * 1000).toISOString());

          // Auto-heal: libera leases expirados de campanhas em execução
          const leaseCutoff = new Date().toISOString();
          await supabaseAdmin
            .from("wa_campaigns")
            .update({ worker_lease_id: null, worker_lease_until: null })
            .in("status", ["running", "paused"])
            .not("worker_lease_until", "is", null)
            .lt("worker_lease_until", leaseCutoff);

          const staleCutoff = new Date(Date.now() - 60 * 1000).toISOString();
          const nowIso2 = new Date().toISOString();
          const { data: activeLeased } = await supabaseAdmin
            .from("wa_campaigns")
            .select("id")
            .in("status", ["running", "paused"])
            .not("worker_lease_until", "is", null)
            .gt("worker_lease_until", nowIso2);
          const activeLeaseIds = (activeLeased ?? []).map((c: any) => c.id as string);

          let healQuery = supabaseAdmin
            .from("campaign_recipients")
            .update({ status: "pending", failed_reason: null, error_code: null })
            .eq("status", "processing")
            .is("meta_message_id", null)
            .lt("last_attempt_at", staleCutoff);
          if (activeLeaseIds.length > 0) {
            healQuery = healQuery.not("campaign_id", "in", `(${activeLeaseIds.join(",")})`);
          }
          const { data: healedRows } = await healQuery.select("campaign_id");
          if (healedRows && healedRows.length > 0) {
            const perCamp = new Map<string, number>();
            for (const r of healedRows) perCamp.set(r.campaign_id as string, (perCamp.get(r.campaign_id as string) ?? 0) + 1);
            for (const [cid, n] of perCamp) {
              try {
                await supabaseAdmin.from("campaign_timeline").insert({
                  campaign_id: cid,
                  event_type: "auto_unstuck",
                  message: `${n} destinatário(s) reenfileirados automaticamente (lease campanha expirado, >5min sem wamid)`,
                  payload: { count: n, stale_cutoff: staleCutoff },
                });
                await supabaseAdmin.rpc("wa_recalc_campaign_progress" as any, { _campaign_id: cid });
              } catch { /* ignore */ }
            }
          }

          const { data: running } = await supabaseAdmin
            .from("wa_campaigns")
            .select("id, rate_per_second")
            .eq("status", "running");

          const TICK_WINDOW_S = 12;
          const results: any[] = [];

          // O lease global só protege a etapa de manutenção/seleção do tick.
          // O controle contra duplicidade real fica no lease por campanha +
          // SKIP LOCKED dos destinatários. Liberar aqui evita que uma execução
          // fique segurando o cron enquanto espera respostas da Graph API.
          await releaseTickLeaseOnce();

          for (const c of running ?? []) {
            // Rate default = 1 msg/s quando a campanha não define; qualquer valor
            // explícito (inclusive baixo) é respeitado sem clamp para cima.
            const rps = Math.max(1, Number((c as any).rate_per_second ?? 1));
            const reservationBudget = Math.min(5000, rps * TICK_WINDOW_S);
            try {
              const r = await processCampaignTick(c.id, reservationBudget);
              results.push({ id: c.id, ...r });
            } catch (e: any) {
              const msg = e?.message ?? String(e);
              results.push({ id: c.id, error: msg });
              // Registro visível na campanha: last_error + timeline event.
              try {
                await supabaseAdmin
                  .from("wa_campaigns")
                  .update({ last_error: `tick_failed: ${msg}` })
                  .eq("id", c.id);
                await supabaseAdmin.from("campaign_timeline").insert({
                  campaign_id: c.id,
                  event_type: "tick_failed",
                  message: `Tick falhou: ${msg}`,
                  payload: { source },
                });
              } catch { /* best-effort */ }
            }
          }


          const hadWork = (running?.length ?? 0) > 0;
          const wallMs = Date.now() - tickStartWall;

          // ---- Libera lease ANTES de encadear (wa_tick_chain checa lease livre) ----
          await releaseTickLeaseOnce();

          // ---- Self-chain: só se houve trabalho e não estamos perto do fim do lease ----
          let chainResult: any = null;
          if (hadWork && CHAIN_APIKEY) {
            try {
              const { data: chain } = await supabaseAdmin.rpc("wa_tick_chain" as any, {
                _url: chainUrl,
                _apikey: CHAIN_APIKEY,
              });
              chainResult = chain;
            } catch (err: any) {
              chainResult = { chained: false, error: err?.message };
            }
          }

          return Response.json({
            ok: true,
            processed_at: nowIso,
            source,
            wall_ms: wallMs,
            results,
            chain: chainResult,
          });
        } catch (err) {
          // libera lease em caso de exceção
          await releaseTickLeaseOnce();
          throw err;
        }
      },
    },
  },
});
