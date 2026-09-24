import { createFileRoute } from "@tanstack/react-router";
import { GRAPH_VERSION } from "@/lib/meta/graph-version";

const STATUS_MAP: Record<string, string> = {
  APPROVED: "approved",
  PENDING: "pending",
  REJECTED: "rejected",
  PAUSED: "paused",
  DISABLED: "disabled",
};

async function syncWaba(supabaseAdmin: any, waba: any) {
  if (!waba.waba_id) return { waba_ref_id: waba.id, skipped: "no_waba_id" };

  // Resolve access token: prefer WABA token, else first connection token, else global env
  let accessToken: string | null = waba.access_token ?? null;
  let graphVersion = GRAPH_VERSION;
  const { data: conn } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("id,access_token,graph_api_version")
    .eq("waba_ref_id", waba.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!accessToken) accessToken = conn?.access_token ?? null;
  if (!accessToken) accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? null;
  if (!accessToken) {
    await supabaseAdmin
      .from("whatsapp_wabas")
      .update({ last_sync_error: "Sem access token", last_synced_at: new Date().toISOString() })
      .eq("id", waba.id);
    return { waba_ref_id: waba.id, error: "no_token" };
  }

  const { syncTemplatesFromMeta } = await import("@/lib/wa-send.server");
  let list: any[];
  try {
    list = await syncTemplatesFromMeta({
      wabaId: waba.waba_id,
      accessToken,
      graphVersion,
    });
  } catch (e: any) {
    const msg = e?.message ?? "Falha na sincronização";
    await supabaseAdmin
      .from("whatsapp_wabas")
      .update({ last_sync_error: msg, last_synced_at: new Date().toISOString() })
      .eq("id", waba.id);
    return { waba_ref_id: waba.id, error: msg };
  }

  let upserted = 0;
  for (const t of list) {
    const comps = (t.components ?? []) as any[];
    const body = comps.find((c) => c.type === "BODY");
    const header = comps.find((c) => c.type === "HEADER");
    const footer = comps.find((c) => c.type === "FOOTER");
    const buttons = comps.find((c) => c.type === "BUTTONS");
    const variables =
      body?.text?.match(/\{\{\d+\}\}/g)?.map((v: string) => v.replace(/[{}]/g, "")) ?? [];

    const { data: existing } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id")
      .eq("waba_ref_id", waba.id)
      .eq("name", t.name)
      .eq("language", t.language)
      .limit(1)
      .maybeSingle();

    const payload = {
      waba_ref_id: waba.id,
      connection_id: conn?.id ?? null,
      meta_template_id: t.id ?? null,
      name: t.name,
      language: t.language,
      category: t.category ?? null,
      status: (STATUS_MAP[t.status] || "pending"),
      header_type: header?.format ? String(header.format).toLowerCase() : null,
      header_text: header?.text ?? null,
      body: body?.text ?? "",
      footer: footer?.text ?? null,
      variables,
      buttons: buttons?.buttons ?? [],
      raw: t,
      last_synced_at: new Date().toISOString(),
    };

    const { error } = existing?.id
      ? await supabaseAdmin.from("whatsapp_templates").update(payload).eq("id", existing.id)
      : await supabaseAdmin.from("whatsapp_templates").insert(payload);
    if (!error) upserted++;
  }

  await supabaseAdmin
    .from("whatsapp_wabas")
    .update({ last_sync_error: null, last_synced_at: new Date().toISOString() })
    .eq("id", waba.id);

  return { waba_ref_id: waba.id, waba_id: waba.waba_id, total: list.length, synced: upserted };
}

export const Route = createFileRoute("/api/public/hooks/wa-templates-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const startedAt = new Date().toISOString();

        const { data: wabas, error } = await supabaseAdmin
          .from("whatsapp_wabas")
          .select("id,waba_id,access_token,status")
          .not("waba_id", "is", null);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const active = (wabas ?? []).filter(
          (w: any) => !w.status || !["suspended", "disconnected", "removed"].includes(String(w.status).toLowerCase()),
        );

        const results: any[] = [];
        for (const w of active) {
          try {
            results.push(await syncWaba(supabaseAdmin, w));
          } catch (e: any) {
            results.push({ waba_ref_id: w.id, error: e?.message ?? "unknown" });
          }
        }

        return Response.json({ ok: true, started_at: startedAt, count: results.length, results });
      },
    },
  },
});
