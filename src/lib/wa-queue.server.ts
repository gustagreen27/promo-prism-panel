// Server-only queue processor for WhatsApp campaigns.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplateMessage } from "@/lib/wa-send.server";

const OPT_OUT_REGEX = /\b(parar|sair|cancelar|cancela|remover|descadastrar|n[ãa]o quero|stop|unsubscribe)\b/i;

export async function processCampaignTick(campaignId: string, batchSize = 25): Promise<{ processed: number; done: boolean }> {
  const { data: camp } = await supabaseAdmin
    .from("wa_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!camp) return { processed: 0, done: true };
  if (camp.status !== "running") return { processed: 0, done: true };
  if (!camp.connection_id || !camp.template_id) {
    await supabaseAdmin.from("wa_campaigns").update({ status: "error" }).eq("id", campaignId);
    return { processed: 0, done: true };
  }

  const { data: conn } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("*")
    .eq("id", camp.connection_id)
    .single();
  const { data: tpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("*")
    .eq("id", camp.template_id)
    .single();

  if (!conn?.phone_number_id || !conn?.access_token || !tpl) {
    await supabaseAdmin.from("wa_campaigns").update({ status: "error" }).eq("id", campaignId);
    return { processed: 0, done: true };
  }

  // Pick a batch
  const { data: recipients } = await supabaseAdmin
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(batchSize);

  if (!recipients || recipients.length === 0) {
    // No more pending — finalize if nothing processing
    const { count: processing } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "processing");
    if (!processing) {
      await supabaseAdmin
        .from("wa_campaigns")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", campaignId);
      return { processed: 0, done: true };
    }
    return { processed: 0, done: false };
  }

  // Mark processing
  await supabaseAdmin
    .from("campaign_recipients")
    .update({ status: "processing" })
    .in("id", recipients.map((r: any) => r.id));

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    // Last-mile opt-out check
    const { data: oo } = await supabaseAdmin
      .from("opt_outs")
      .select("id")
      .eq("phone", r.phone)
      .maybeSingle();
    if (oo) {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "opt_out", failed_reason: "Contato em opt-out" })
        .eq("id", r.id);
      continue;
    }

    const result = await sendTemplateMessage({
      phoneNumberId: conn.phone_number_id!,
      accessToken: conn.access_token!,
      graphVersion: conn.graph_api_version || "v21.0",
      to: r.phone.replace(/\D/g, ""),
      templateName: tpl.name,
      languageCode: tpl.language || "pt_BR",
      variables: (r.variables as Record<string, string> | null) || {},
      headerType: tpl.header_type,
      headerValue: tpl.header_text,
    });

    if (result.ok) {
      sent++;
      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          status: "sent",
          meta_message_id: result.metaMessageId,
          sent_at: new Date().toISOString(),
          attempt: (r.attempt ?? 0) + 1,
        })
        .eq("id", r.id);
    } else {
      failed++;
      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failed_reason: result.error,
          error_code: result.code,
          attempt: (r.attempt ?? 0) + 1,
        })
        .eq("id", r.id);
    }
  }

  // Update counters
  // counters refresh follows
  const { data: counts } = await supabaseAdmin
    .from("campaign_recipients")
    .select("status")
    .eq("campaign_id", campaignId);
  const c = {
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    replied: 0,
  };
  for (const row of counts ?? []) {
    const s = (row as any).status as string;
    if (s === "sent" || s === "delivered" || s === "read" || s === "replied") c.sent++;
    if (s === "delivered" || s === "read" || s === "replied") c.delivered++;
    if (s === "read" || s === "replied") c.read++;
    if (s === "replied") c.replied++;
    if (s === "failed") c.failed++;
  }
  await supabaseAdmin
    .from("wa_campaigns")
    .update({
      sent_count: c.sent,
      delivered_count: c.delivered,
      read_count: c.read,
      failed_count: c.failed,
      replied_count: c.replied,
    })
    .eq("id", campaignId);

  return { processed: sent + failed, done: false };
}

export { OPT_OUT_REGEX };
