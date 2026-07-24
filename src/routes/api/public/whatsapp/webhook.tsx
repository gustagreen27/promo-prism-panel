import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

const OPT_OUT_REGEX = /\b(parar|sair|cancelar|cancela|remover|descadastrar|n[ãa]o quero|stop|unsubscribe)\b/i;

// Prioridade — evita regressão de status (ex.: um webhook "sent" atrasado
// não pode sobrescrever um "read" já registrado).
const STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  processing: 1,
  accepted: 2,
  sent: 3,
  delivered: 4,
  read: 5,
  replied: 6,
};

// Enum whatsapp_templates.status = approved|pending|rejected|paused|disabled
function mapTemplateStatus(ev: string | undefined | null): string | null {
  if (!ev) return null;
  const s = String(ev).toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PENDING" || s === "IN_APPEAL" || s === "PENDING_DELETION") return "pending";
  if (s === "PAUSED" || s === "FLAGGED") return "paused";
  if (s === "DISABLED" || s === "DELETED") return "disabled";
  return null;
}

function computeSig(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function safeCompareHex(providedHex: string, expectedHex: string): boolean {
  try {
    const a = Buffer.from(providedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifySignatureWithSecret(rawBody: string, signatureHeader: string | null, secret: string | null | undefined): boolean {
  if (!secret) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length).trim();
  return safeCompareHex(provided, computeSig(rawBody, secret));
}

/**
 * Extrai phone_number_id / waba_id do payload sem confiar em nenhuma assinatura.
 * Usado apenas para localizar qual conexão possui o App Secret esperado.
 */
function extractRoutingHints(rawBody: string): { phone_number_ids: string[]; waba_ids: string[] } {
  const phones = new Set<string>();
  const wabas = new Set<string>();
  try {
    const p = JSON.parse(rawBody);
    const entries: any[] = Array.isArray(p?.entry) ? p.entry : [];
    for (const e of entries) {
      if (e?.id) wabas.add(String(e.id));
      const changes: any[] = Array.isArray(e?.changes) ? e.changes : [];
      for (const c of changes) {
        const v = c?.value ?? {};
        const pnid = v?.metadata?.phone_number_id ?? v?.phone_number_id ?? v?.phone_number;
        if (pnid) phones.add(String(pnid));
      }
    }
  } catch {
    /* ignore */
  }
  return { phone_number_ids: Array.from(phones), waba_ids: Array.from(wabas) };
}


// Extrai a mensagem de erro mais informativa de uma entrada `errors[]` da Meta.
function extractError(err: any) {
  const code = err?.code != null ? String(err.code) : null;
  const title: string | null = err?.title ?? null;
  const message: string | null = err?.message ?? null;
  const details: string | null = err?.error_data?.details ?? null;
  const reason = details || message || title || "failed";
  return { code, title, message, details, reason };
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // ────────────────────────────────────────────────────────────
      // GET — verificação do webhook (hub.challenge)
      // ────────────────────────────────────────────────────────────
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token) {
          return new Response("forbidden", { status: 403 });
        }

        // 0) token via variável de ambiente (WHATSAPP_VERIFY_TOKEN)
        const envToken = process.env.WHATSAPP_VERIFY_TOKEN;
        if (envToken && envToken === token) {
          return new Response(challenge ?? "", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) token global (settings.whatsapp_webhook.verify_token)
        const { data: setting } = await supabaseAdmin
          .from("settings")
          .select("value")
          .eq("key", "whatsapp_webhook")
          .maybeSingle();
        const globalToken = (setting?.value as { verify_token?: string } | null)?.verify_token;
        if (globalToken && globalToken === token) {
          return new Response(challenge ?? "", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        // 2) token por conexão
        const { data: conns } = await supabaseAdmin
          .from("whatsapp_connections")
          .select("id")
          .eq("verify_token", token)
          .limit(1);
        if (conns && conns.length > 0) {
          return new Response(challenge ?? "", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        return new Response("invalid token", { status: 403 });
      },

      // ────────────────────────────────────────────────────────────
      // POST — eventos (mensagens, status, templates, contas, etc)
      // ────────────────────────────────────────────────────────────
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        const globalSecret = process.env.META_APP_SECRET;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Tenta validar com o App Secret global (retrocompatível).
        let valid = verifySignatureWithSecret(rawBody, sig, globalSecret);
        let matchedBy: string | null = valid ? "global" : null;

        // 2) Se falhou, tenta com o App Secret específico de cada conexão
        //    apontada pelo payload (por phone_number_id ou waba_id).
        if (!valid && sig) {
          const hints = extractRoutingHints(rawBody);
          if (hints.phone_number_ids.length || hints.waba_ids.length) {
            const q = supabaseAdmin
              .from("whatsapp_connections")
              .select("id, app_secret, phone_number_id, waba_id, use_global_token");
            const orFilters: string[] = [];
            for (const p of hints.phone_number_ids) orFilters.push(`phone_number_id.eq.${p}`);
            for (const w of hints.waba_ids) orFilters.push(`waba_id.eq.${w}`);
            const { data: candidates } = await q.or(orFilters.join(","));
            for (const c of (candidates ?? []) as any[]) {
              // Se conexão usa credencial global, o global já foi tentado acima.
              if (c.use_global_token) continue;
              if (!c.app_secret) continue;
              if (verifySignatureWithSecret(rawBody, sig, c.app_secret)) {
                valid = true;
                matchedBy = `connection:${c.id}`;
                break;
              }
            }
          }
        }

        const strict = !!globalSecret; // manter comportamento estrito quando há segredo global
        if (strict && !valid) {
          // Log sanitizado — nunca gravar assinatura nem corpo cru.
          await supabaseAdmin.from("whatsapp_webhook_logs").insert({
            event_type: "invalid_signature",
            payload: { has_signature: !!sig, bytes: rawBody.length, matched_by: null },
            error: "invalid X-Hub-Signature-256",
          });
          return new Response("invalid signature", { status: 401 });
        }
        // (matchedBy é apenas registrado nos logs abaixo, quando aplicável)
        void matchedBy;


        let payload: any = {};
        try {
          payload = JSON.parse(rawBody);
        } catch {
          // corpo inválido — responde 200 para evitar retentativa infinita.
          await supabaseAdmin.from("whatsapp_webhook_logs").insert({
            event_type: "invalid_json",
            payload: { bytes: rawBody.length },
            error: "invalid JSON body",
          });
          return new Response("ok", { status: 200 });
        }

        // Log do payload cru — a Meta não envia access token nem app secret
        // aqui, mas usamos um resumo dos campos para diagnóstico rápido.
        const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
        const fields = entries
          .flatMap((e) => (Array.isArray(e?.changes) ? e.changes.map((c: any) => c?.field) : []))
          .filter(Boolean);
        await supabaseAdmin.from("whatsapp_webhook_logs").insert({
          event_type: fields[0] ?? "unknown",
          payload: { ...payload, __fields: fields, __entries: entries.length },
        });

        // Processamento resiliente — nunca falhe a resposta 200 por causa
        // de um erro em um dos itens; capture por item e siga.
        for (const entry of entries) {
          const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
          for (const change of changes) {
            try {
              await handleChange(supabaseAdmin, change);
            } catch (e: any) {
              await supabaseAdmin.from("whatsapp_webhook_logs").insert({
                event_type: "handler_error",
                payload: { field: change?.field, message: e?.message },
                error: e?.message ?? "handler error",
              });
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

// ────────────────────────────────────────────────────────────────────
// Handler por change (um item em entry.changes[])
// ────────────────────────────────────────────────────────────────────
async function handleChange(supabaseAdmin: any, change: any) {
  const field: string = change?.field ?? "";
  const value: any = change?.value ?? {};

  // Campos relacionados a templates ────────────────────────────────
  if (
    field === "message_template_status_update" ||
    field === "message_template_quality_update" ||
    field === "message_template_components_update" ||
    field === "template_category_update"
  ) {
    const metaId = value?.message_template_id
      ? String(value.message_template_id)
      : null;
    const name: string | null = value?.message_template_name ?? null;
    const language: string | null = value?.message_template_language ?? null;
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };

    if (field === "message_template_status_update") {
      const status = mapTemplateStatus(value?.event);
      if (status) patch.status = status;
      if (value?.reason) patch.rejection_reason = String(value.reason);
      patch.reviewed_at = new Date().toISOString();
    } else if (field === "template_category_update") {
      if (value?.new_category) patch.category = String(value.new_category);
    } else if (field === "message_template_components_update") {
      // Atualiza raw para refletir a nova estrutura recebida.
      patch.raw = value;
    }

    if (metaId) {
      await supabaseAdmin.from("whatsapp_templates").update(patch).eq("meta_template_id", metaId);
    } else if (name) {
      const q = supabaseAdmin.from("whatsapp_templates").update(patch).eq("name", name);
      if (language) await q.eq("language", language);
      else await q;
    }
    return;
  }

  // Qualidade / limites / alertas por número ───────────────────────
  if (
    field === "phone_number_quality_update" ||
    field === "account_alerts" ||
    field === "business_capability_update" ||
    field === "account_update"
  ) {
    const phoneNumberId =
      value?.phone_number ||
      value?.phone_number_id ||
      value?.metadata?.phone_number_id ||
      null;
    if (phoneNumberId) {
      const patch: Record<string, any> = { last_meta_sync_at: new Date().toISOString() };
      if (field === "phone_number_quality_update") {
        if (value?.current_limit) patch.messaging_limit = String(value.current_limit);
        if (value?.event) patch.quality_rating = String(value.event);
      }
      await supabaseAdmin
        .from("whatsapp_connections")
        .update(patch)
        .eq("phone_number_id", phoneNumberId);
    }
    return;
  }

  // Nome de exibição do número (phone_number_name_update) ──────────
  if (field === "phone_number_name_update") {
    const phoneNumberId = value?.phone_number ?? value?.phone_number_id;
    const decision: string = value?.decision ?? value?.name_status ?? "";
    const requestedName: string | null =
      value?.requested_verified_name ?? value?.display_name ?? null;
    const reason: string | null = value?.rejection_reason ?? null;
    if (!phoneNumberId) return;

    const { data: conn } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id, workspace_id")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (!conn) return;

    const patch: Record<string, any> = {
      display_name_reviewed_at: new Date().toISOString(),
      last_meta_sync_at: new Date().toISOString(),
    };
    let action = "DISPLAY_NAME_APPROVED";
    if (decision === "APPROVED") {
      patch.display_name_status = "APPROVED";
      patch.display_name_rejection_reason = null;
    } else if (decision === "REJECTED" || decision === "DECLINED") {
      patch.display_name_status = "DECLINED";
      patch.display_name_rejection_reason = reason ?? "Rejeitado pela Meta";
      action = "DISPLAY_NAME_REJECTED";
    }
    await supabaseAdmin.from("whatsapp_connections").update(patch).eq("id", conn.id);
    await supabaseAdmin.from("whatsapp_profile_audit_logs").insert({
      workspace_id: conn.workspace_id,
      connection_id: conn.id,
      phone_number_id: phoneNumberId,
      action,
      new_value: { requested: requestedName, reason },
      status: "success",
    });
    return;
  }

  // Campo padrão: messages (statuses + mensagens recebidas) ────────
  if (field !== "messages") {
    // Outros campos apenas ficam registrados em whatsapp_webhook_logs.
    return;
  }

  const phoneNumberId = value?.metadata?.phone_number_id ?? null;
  let connectionId: string | null = null;
  let workspaceId: string | null = null;
  let wabaId: string | null = null;
  if (phoneNumberId) {
    const { data: conn } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id, workspace_id, waba_id")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    connectionId = conn?.id ?? null;
    workspaceId = conn?.workspace_id ?? null;
    wabaId = conn?.waba_id ?? null;
  }

  // ── statuses[] ─────────────────────────────────────────────────
  const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
  for (const s of statuses) {
    const id: string | undefined = s?.id;
    const status: string | undefined = s?.status;
    if (!id || !status) continue;

    const tsIso = s?.timestamp
      ? new Date(Number(s.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const { data: rec } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, workspace_id, status, sent_at, delivered_at, read_at, failed_at")
      .eq("meta_message_id", id)
      .maybeSingle();

    // Idempotência: se o timestamp do status já existe, é um evento
    // duplicado — pulamos a atualização mas seguimos com o log.
    const patch: Record<string, any> = {};
    if (status === "sent" && !rec?.sent_at) patch.sent_at = tsIso;
    if (status === "delivered" && !rec?.delivered_at) patch.delivered_at = tsIso;
    if (status === "read" && !rec?.read_at) patch.read_at = tsIso;
    if (status === "failed") {
      const err = extractError(s?.errors?.[0]);
      if (!rec?.failed_at) patch.failed_at = tsIso;
      patch.status = "failed";
      patch.failed_reason = err.reason;
      patch.error_code = err.code;
    } else if (rec) {
      const cur = STATUS_PRIORITY[rec.status as string] ?? -1;
      const next = STATUS_PRIORITY[status] ?? -1;
      if (next > cur) patch.status = status;
    }

    if (rec && Object.keys(patch).length) {
      await supabaseAdmin.from("campaign_recipients").update(patch).eq("id", rec.id);
    }

    await supabaseAdmin.from("whatsapp_webhook_logs").insert({
      connection_id: connectionId,
      event_type: "message_status",
      processed: !!rec,
      error: rec ? null : "recipient_not_found",
      payload: {
        campaign_id: rec?.campaign_id ?? null,
        recipient_id: rec?.id ?? null,
        meta_message_id: id,
        phone_number_id: phoneNumberId,
        status,
        timestamp: tsIso,
        applied_patch: Object.keys(patch),
      },
    });

    if (rec?.campaign_id) {
      await supabaseAdmin.from("campaign_timeline").insert({
        campaign_id: rec.campaign_id,
        workspace_id: rec.workspace_id,
        event_type: "webhook_message_status",
        message: `Webhook ${status} processado`,
        payload: {
          recipient_id: rec.id,
          meta_message_id: id,
          status,
          applied_patch: Object.keys(patch),
        },
      });
    }

    // Espelha no message_logs (auditoria por mensagem).
    const logPatch: Record<string, any> = { message_status: status };
    if (status === "failed") {
      const err = extractError(s?.errors?.[0]);
      logPatch.failed_reason = err.reason;
      logPatch.error_code = err.code;
    }
    await supabaseAdmin.from("message_logs").update(logPatch).eq("meta_message_id", id);

    // Atualiza espelho na tabela de mensagens de conversas (atendimento).
    if (id && workspaceId) {
      const convPatch: Record<string, any> = {};
      if (status === "sent") convPatch.sent_at = tsIso;
      if (status === "delivered") convPatch.delivered_at = tsIso;
      if (status === "read") convPatch.read_at = tsIso;
      if (status === "failed") {
        convPatch.failed_at = tsIso;
        const err = extractError(s?.errors?.[0]);
        convPatch.error_code = err.code;
        convPatch.error_message = err.reason;
      }
      convPatch.status = status;
      await supabaseAdmin
        .from("wa_conversation_messages")
        .update(convPatch)
        .eq("workspace_id", workspaceId)
        .eq("wamid", id);
    }
  }

  // ── messages[] (inbound + replies + opt-out) ───────────────────
  const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
  for (const m of messages) {
    const from: string | undefined = m?.from;
    const body: string = m?.text?.body ?? "";
    const wamid: string | null = m?.id ?? null;

    // Dedup por wamid — se já registramos essa mensagem, ignoramos.
    if (wamid) {
      const { data: dup } = await supabaseAdmin
        .from("whatsapp_inbox")
        .select("id")
        .eq("meta_message_id", wamid)
        .maybeSingle();
      if (dup) continue;
    }

    await supabaseAdmin.from("whatsapp_inbox").insert({
      connection_id: connectionId,
      phone: from,
      direction: "in",
      message_type: m?.type ?? "text",
      body,
      meta_message_id: wamid,
      raw: m,
    });

    if (from) {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "replied", replied_at: new Date().toISOString() })
        .eq("phone", from)
        .in("status", ["sent", "delivered", "read"]);
      await supabaseAdmin
        .from("contacts")
        .update({ last_interaction_at: new Date().toISOString() })
        .eq("phone", from);

      // ── Atendimento: alimenta wa_conversations + wa_conversation_messages ──
      if (workspaceId) {
        try {
          await upsertConversationFromInbound(supabaseAdmin, {
            workspaceId,
            connectionId,
            phoneNumberId,
            wabaId,
            from,
            body,
            message: m,
            wamid,
          });
        } catch (e: any) {
          await supabaseAdmin.from("whatsapp_webhook_logs").insert({
            connection_id: connectionId,
            event_type: "conversation_upsert_error",
            processed: false,
            error: e?.message ?? "upsert failed",
            payload: { from, wamid },
          });
        }
      }
    }
    if (body && OPT_OUT_REGEX.test(body) && from) {
      await supabaseAdmin
        .from("opt_outs")
        .upsert({ phone: from, reason: "keyword" }, { onConflict: "phone" });
      await supabaseAdmin
        .from("contacts")
        .update({ opt_out: true, opt_out_at: new Date().toISOString() })
        .eq("phone", from);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Atendimento: cria/atualiza wa_conversations e registra a mensagem
// inbound em wa_conversation_messages, abrindo/estendendo a janela 24h.
// ────────────────────────────────────────────────────────────────────
async function upsertConversationFromInbound(
  supabaseAdmin: any,
  args: {
    workspaceId: string;
    connectionId: string | null;
    phoneNumberId: string | null;
    wabaId: string | null;
    from: string;
    body: string;
    message: any;
    wamid: string | null;
  },
) {
  const { workspaceId, connectionId, phoneNumberId, wabaId, from, body, message, wamid } = args;
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const type = String(message?.type ?? "text");

  // Preview textual.
  let preview: string = body;
  if (!preview) {
    if (type === "interactive") {
      preview =
        message?.interactive?.button_reply?.title ??
        message?.interactive?.list_reply?.title ??
        "[interativa]";
    } else if (type === "image") preview = "[imagem]";
    else if (type === "audio") preview = "[áudio]";
    else if (type === "video") preview = "[vídeo]";
    else if (type === "document") preview = "[documento]";
    else if (type === "sticker") preview = "[sticker]";
    else if (type === "location") preview = "[localização]";
    else preview = `[${type}]`;
  }

  // Nome do contato do payload.
  const profileName: string | null = message?.profile?.name
    ? String(message.profile.name)
    : null;

  // Localiza contato existente e a última campanha associada ao número.
  let contactId: string | null = null;
  {
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("phone", from)
      .maybeSingle();
    if (c?.id) contactId = c.id;
  }
  let campaignId: string | null = null;
  let campaignRecipientId: string | null = null;
  {
    const { data: r } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("phone", from)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (r?.id) {
      campaignRecipientId = r.id;
      campaignId = r.campaign_id ?? null;
    }
  }

  // Upsert por (workspace_id, connection_id, contact_phone).
  let conversationId: string | null = null;
  if (connectionId) {
    const { data: existing } = await supabaseAdmin
      .from("wa_conversations")
      .select("id, unread_count, contact_id, contact_name, campaign_id, campaign_recipient_id")
      .eq("workspace_id", workspaceId)
      .eq("connection_id", connectionId)
      .eq("contact_phone", from)
      .maybeSingle();

    if (existing?.id) {
      conversationId = existing.id;
      const patch: Record<string, any> = {
        last_inbound_at: nowIso,
        last_message_at: nowIso,
        last_message_preview: preview.slice(0, 500),
        unread_count: (existing.unread_count ?? 0) + 1,
        service_window_opened_at: nowIso,
        service_window_expires_at: expiresIso,
        service_window_status: "open",
      };
      if (!existing.contact_id && contactId) patch.contact_id = contactId;
      if (!existing.contact_name && profileName) patch.contact_name = profileName;
      if (!existing.campaign_id && campaignId) patch.campaign_id = campaignId;
      if (!existing.campaign_recipient_id && campaignRecipientId)
        patch.campaign_recipient_id = campaignRecipientId;
      await supabaseAdmin.from("wa_conversations").update(patch).eq("id", existing.id);
    } else {
      const { data: inserted } = await supabaseAdmin
        .from("wa_conversations")
        .insert({
          workspace_id: workspaceId,
          connection_id: connectionId,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          contact_id: contactId,
          contact_phone: from,
          contact_name: profileName,
          wa_id: from,
          campaign_id: campaignId,
          campaign_recipient_id: campaignRecipientId,
          last_inbound_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: preview.slice(0, 500),
          unread_count: 1,
          service_window_opened_at: nowIso,
          service_window_expires_at: expiresIso,
          service_window_status: "open",
          conversation_status: "open",
        })
        .select("id")
        .single();
      conversationId = inserted?.id ?? null;
    }
  }

  if (!conversationId) return;

  // Dedup inbound por wamid: se já existe, NÃO reprocessa side effects (auto-reply, etc).
  if (wamid) {
    const { data: dup } = await supabaseAdmin
      .from("wa_conversation_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("wamid", wamid)
      .maybeSingle();
    if (dup?.id) return;
  }

  const msgRow: Record<string, any> = {
    workspace_id: workspaceId,
    conversation_id: conversationId,
    direction: "inbound",
    origin: "customer",
    wamid,
    message_type: type,
    body: body || null,
    status: "received",
    received_at: nowIso,
    payload: message,
    campaign_id: campaignId,
    campaign_recipient_id: campaignRecipientId,
  };
  if (type === "interactive") {
    const br = message?.interactive?.button_reply;
    const lr = message?.interactive?.list_reply;
    if (br) {
      msgRow.interactive_type = "button_reply";
      msgRow.interactive_button_id = br.id ?? null;
      msgRow.interactive_button_title = br.title ?? null;
    } else if (lr) {
      msgRow.interactive_type = "list_reply";
      msgRow.interactive_list_id = lr.id ?? null;
      msgRow.interactive_list_title = lr.title ?? null;
      // Preserva descrição em body para exibição/auditoria (coluna dedicada não existe).
      if (lr.description && !msgRow.body) msgRow.body = String(lr.description).slice(0, 500);
    }
  } else if (type === "image" || type === "video" || type === "audio" || type === "document" || type === "sticker") {
    const media = message?.[type] ?? {};
    msgRow.media_id = media?.id ?? null;
    msgRow.media_mime = media?.mime_type ?? null;
    msgRow.media_caption = media?.caption ?? null;
    msgRow.media_filename = media?.filename ?? null;
  }
  if (message?.context?.id) msgRow.context_wamid = String(message.context.id);

  const { error: insertErr } = await supabaseAdmin
    .from("wa_conversation_messages")
    .insert(msgRow);
  // 23505 = unique_violation (race entre dois webhooks do mesmo wamid): silenciar.
  if (insertErr && (insertErr as any).code !== "23505") {
    await supabaseAdmin.from("whatsapp_webhook_logs").insert({
      connection_id: connectionId,
      event_type: "conversation_msg_insert_error",
      processed: false,
      error: (insertErr as any).message ?? "insert failed",
      payload: { wamid },
    });
    return;
  }
  if (insertErr) return; // duplicate — não roda side effects

  // ── Fluxo de resposta configurado na campanha (auto-reply na janela 24h) ──
  if (campaignId) {
    try {
      await applyResponseFlow(supabaseAdmin, {
        workspaceId,
        conversationId,
        connectionId,
        phoneNumberId,
        from,
        campaignId,
        inboundWamid: wamid,
      });
    } catch (e: any) {
      await supabaseAdmin.from("whatsapp_webhook_logs").insert({
        connection_id: connectionId,
        event_type: "response_flow_error",
        processed: false,
        error: e?.message ?? "response flow failed",
        payload: { conversation_id: conversationId, campaign_id: campaignId },
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// applyResponseFlow — lê wa_campaigns.response_flow_* e, se habilitado,
// enfileira uma auto-resposta em wa_service_queue e aplica status/tags
// na conversa. Respeita cooldown em metadata.last_auto_reply_at.
// ────────────────────────────────────────────────────────────────────
async function applyResponseFlow(
  supabaseAdmin: any,
  args: {
    workspaceId: string;
    conversationId: string;
    connectionId: string | null;
    phoneNumberId: string | null;
    from: string;
    campaignId: string;
  },
) {
  const { workspaceId, conversationId, connectionId, phoneNumberId, from, campaignId } = args;

  const { data: camp } = await supabaseAdmin
    .from("wa_campaigns")
    .select("id, response_flow_enabled, response_flow_config")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp?.response_flow_enabled) return;
  const cfg = (camp.response_flow_config ?? {}) as {
    auto_reply_text?: string | null;
    assign_status?: string | null;
    tags?: string[] | null;
    cooldown_minutes?: number | null;
  };

  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, tags, metadata, conversation_status")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;

  const meta = (conv.metadata ?? {}) as Record<string, any>;
  const lastAutoAt = meta.last_auto_reply_at ? Date.parse(meta.last_auto_reply_at) : 0;
  const cooldownMs = Math.max(0, (cfg.cooldown_minutes ?? 60)) * 60 * 1000;
  const now = Date.now();
  const cooldownOk = !lastAutoAt || now - lastAutoAt >= cooldownMs;

  // Aplica tags + status independente do cooldown.
  const patch: Record<string, any> = {};
  if (cfg.assign_status) patch.conversation_status = cfg.assign_status;
  if (Array.isArray(cfg.tags) && cfg.tags.length) {
    const existing = new Set<string>((conv.tags ?? []) as string[]);
    for (const t of cfg.tags) if (t) existing.add(String(t));
    patch.tags = Array.from(existing).slice(0, 20);
  }
  if (Object.keys(patch).length) {
    await supabaseAdmin.from("wa_conversations").update(patch).eq("id", conversationId);
  }

  const text = (cfg.auto_reply_text ?? "").trim();
  if (!text || !cooldownOk || !connectionId || !phoneNumberId) return;

  const idem = `flow:${conversationId}:${Math.floor(now / cooldownMs || 1)}`;
  const { data: msg } = await supabaseAdmin
    .from("wa_conversation_messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: "outbound",
      origin: "auto_flow",
      message_type: "text",
      body: text,
      status: "queued",
      payload: { kind: "text", body: text, source: "response_flow" },
    })
    .select("id")
    .single();

  const nowIso = new Date(now).toISOString();
  await supabaseAdmin.from("wa_service_queue").insert({
    workspace_id: workspaceId,
    conversation_id: conversationId,
    connection_id: connectionId,
    phone_number_id: phoneNumberId,
    contact_phone: from,
    message_id: msg?.id ?? null,
    payload: { kind: "text", body: text, source: "response_flow" },
    idempotency_key: idem,
    priority: 2,
    origin: "auto_flow",
    scheduled_at: nowIso,
    next_attempt_at: nowIso,
  });

  await supabaseAdmin
    .from("wa_conversations")
    .update({
      last_outbound_at: nowIso,
      last_message_at: nowIso,
      last_message_preview: text.slice(0, 500),
      metadata: { ...meta, last_auto_reply_at: nowIso },
    })
    .eq("id", conversationId);
}

