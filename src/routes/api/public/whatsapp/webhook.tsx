import { createFileRoute } from "@tanstack/react-router";

const OPT_OUT_REGEX =
  /\b(parar|sair|cancelar|cancela|remover|descadastrar|n[ãa]o quero|stop|unsubscribe)\b/i;

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

// Variantes de um número BR: a Meta entrega alguns celulares sem o 9º dígito,
// enquanto a base pode ter salvo com ele (ou vice-versa).
function brPhoneVariants(raw: string): string[] {
  const d = String(raw ?? "").replace(/\D/g, "");
  const out = new Set<string>([d]);
  if (d.startsWith("55")) {
    const rest = d.slice(2);
    if (rest.length === 11 && rest[2] === "9") out.add(`55${rest.slice(0, 2)}${rest.slice(3)}`);
    if (rest.length === 10) out.add(`55${rest.slice(0, 2)}9${rest.slice(2)}`);
  }
  return Array.from(out);
}

function inboundMessageText(message: any): string {
  return String(
    message?.text?.body ??
      message?.button?.text ??
      message?.button?.payload ??
      message?.interactive?.button_reply?.title ??
      message?.interactive?.list_reply?.title ??
      "",
  );
}

async function resolveInboundCampaignLink(
  supabaseAdmin: any,
  args: {
    from?: string | null;
    contextWamid?: string | null;
    connectionWorkspaceId?: string | null;
    connectionId?: string | null;
  },
): Promise<{ workspaceId: string | null; campaignId: string | null; recipientId: string | null }> {
  const { from, contextWamid, connectionWorkspaceId, connectionId } = args;

  if (contextWamid) {
    const { data: byContext } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, workspace_id, wa_campaigns!inner(workspace_id)")
      .eq("meta_message_id", contextWamid)
      .maybeSingle();
    if (byContext?.id) {
      const campaignWorkspaceId = (byContext as any).wa_campaigns?.workspace_id ?? null;
      return {
        workspaceId: campaignWorkspaceId ?? byContext.workspace_id ?? connectionWorkspaceId ?? null,
        campaignId: byContext.campaign_id ?? null,
        recipientId: byContext.id,
      };
    }
  }

  if (!from) {
    return { workspaceId: connectionWorkspaceId ?? null, campaignId: null, recipientId: null };
  }

  const phoneCandidates = brPhoneVariants(from);
  let q = supabaseAdmin
    .from("campaign_recipients")
    .select(
      "id, campaign_id, workspace_id, last_attempt_at, wa_campaigns!inner(workspace_id, connection_id)",
    )
    .in("phone", phoneCandidates)
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (connectionId) q = q.eq("wa_campaigns.connection_id", connectionId);
  const { data: rows } = await q;
  let row = rows?.[0] ?? null;

  if (!row && connectionWorkspaceId) {
    const { data: workspaceRows } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, workspace_id, last_attempt_at, wa_campaigns!inner(workspace_id)")
      .in("phone", phoneCandidates)
      .eq("wa_campaigns.workspace_id", connectionWorkspaceId)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(1);
    row = workspaceRows?.[0] ?? null;
  }

  if (!row) {
    const { data: anyRows } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, workspace_id, last_attempt_at, wa_campaigns!inner(workspace_id)")
      .in("phone", phoneCandidates)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(1);
    row = anyRows?.[0] ?? null;
  }

  if (!row?.id) {
    return { workspaceId: connectionWorkspaceId ?? null, campaignId: null, recipientId: null };
  }

  const campaignWorkspaceId = (row as any).wa_campaigns?.workspace_id ?? null;
  return {
    workspaceId: campaignWorkspaceId ?? row.workspace_id ?? connectionWorkspaceId ?? null,
    campaignId: row.campaign_id ?? null,
    recipientId: row.id,
  };
}

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

// Validação de assinatura multi-App: ver src/lib/wa-webhook-secrets.server.ts


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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadWebhookSecretCandidates, verifyAgainstCandidates } = await import(
          "@/lib/wa-webhook-secrets.server"
        );

        // Validação multi-App: tenta todos os App Secrets legitimamente
        // cadastrados (env, settings.meta_app_secrets e conexões).
        const hints = extractRoutingHints(rawBody);
        const candidates = await loadWebhookSecretCandidates(supabaseAdmin);
        const { valid, matched, tried } = verifyAgainstCandidates(rawBody, sig, candidates, hints);
        const matchedBy = matched?.label ?? null;

        // Mantemos a exigência estrita da assinatura sempre que houver ao
        // menos um segredo conhecido — nunca aceitamos payload sem assinatura.
        const strict = candidates.length > 0;
        if (strict && !valid) {
          // Log sanitizado — nunca gravar assinatura, segredo ou corpo cru.
          await supabaseAdmin.from("whatsapp_webhook_logs").insert({
            event_type: "invalid_signature",
            payload: {
              has_signature: !!sig,
              bytes: rawBody.length,
              matched_by: null,
              secrets_tried: tried,
              known_app_ids: Array.from(
                new Set(candidates.map((c) => c.appId).filter(Boolean)),
              ) as string[],
              phone_number_ids: hints.phone_number_ids,
              waba_ids: hints.waba_ids,
            },
            error: "invalid X-Hub-Signature-256",
          });
          return new Response("invalid signature", { status: 401 });
        }


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
          payload: {
            ...payload,
            __fields: fields,
            __entries: entries.length,
            __sig_matched_by: matchedBy,
            __sig_app_id: matched?.appId ?? null,
            __sig_source: matched?.source ?? null,
          },

        });

        // Processamento resiliente — nunca falhe a resposta 200 por causa
        // de um erro em um dos itens; capture por item e siga.
        for (const entry of entries) {
          const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
          for (const change of changes) {
            try {
              await handleChange(supabaseAdmin, change, entry?.id ? String(entry.id) : null);

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
/** Converte o limite numérico do webhook em tier da Meta. */
function numberToTier(raw: any): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).toUpperCase();
  if (s.startsWith("TIER_")) return s;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return "TIER_UNLIMITED";
  if (n >= 100000) return "TIER_100K";
  if (n >= 10000) return "TIER_10K";
  if (n >= 2000) return "TIER_2K";
  if (n >= 1000) return "TIER_1K";
  if (n >= 250) return "TIER_250";
  if (n >= 50) return "TIER_50";
  return "UNTIERED";
}

async function handleChange(supabaseAdmin: any, change: any, entryId: string | null = null) {

  const field: string = change?.field ?? "";
  const value: any = change?.value ?? {};


  // Campos relacionados a templates ────────────────────────────────
  if (
    field === "message_template_status_update" ||
    field === "message_template_quality_update" ||
    field === "message_template_components_update" ||
    field === "template_category_update"
  ) {
    const metaId = value?.message_template_id ? String(value.message_template_id) : null;
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

  // Limite de mensagens do Portfólio Empresarial (compartilhado pela BM) ──
  // business_capability_update chega no nível da WABA (entry.id) e informa
  // o limite numericamente (250, 2000, 10000, 100000, -1 = ilimitado).
  if (field === "business_capability_update") {
    const raw =
      value?.max_daily_conversation_per_phone ??
      value?.messaging_limit ??
      value?.current_limit ??
      null;
    const tier = numberToTier(raw);
    const wabaId = value?.waba_id ?? value?.whatsapp_business_account_id ?? entryId;
    if (tier && wabaId) {
      await supabaseAdmin
        .from("whatsapp_connections")
        .update({ messaging_limit: tier, last_meta_sync_at: new Date().toISOString() })
        .eq("waba_id", String(wabaId));
    }
    return;
  }

  // MM Lite: Termos aceitos / conta de anúncios vinculada ──────────
  if (field === "account_update") {
    const event = String(value?.event ?? "").toUpperCase();
    const info = value?.waba_info ?? {};
    if (event === "MM_LITE_TERMS_SIGNED" || event === "AD_ACCOUNT_LINKED") {
      const wabaId = info?.waba_id ?? null;
      if (wabaId) {
        const { markMmLiteOnboarded } = await import("@/lib/meta/mm-lite.server");
        await markMmLiteOnboarded(supabaseAdmin, String(wabaId), info?.ad_account_id ?? null);
      }
    }
  }

  // Qualidade / limites / alertas por número ───────────────────────
  if (
    field === "phone_number_quality_update" ||
    field === "account_alerts" ||
    field === "account_update"
  ) {
    const phoneNumberId =
      value?.phone_number || value?.phone_number_id || value?.metadata?.phone_number_id || null;
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
    const { data: conns } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id, workspace_id, waba_id")
      .eq("phone_number_id", phoneNumberId)
      .order("created_at", { ascending: true })
      .limit(1);
    const conn = (conns ?? [])[0];
    connectionId = conn?.id ?? null;
    workspaceId = conn?.workspace_id ?? null;
    wabaId = conn?.waba_id ?? entryId ?? null;

    // Fallback: workspace pela WABA (conexões antigas podem estar sem workspace).
    if (!workspaceId && wabaId) {
      const { data: waba } = await supabaseAdmin
        .from("whatsapp_wabas")
        .select("workspace_id")
        .eq("waba_id", String(wabaId))
        .limit(1)
        .maybeSingle();
      workspaceId = waba?.workspace_id ?? null;
      if (workspaceId && connectionId) {
        await supabaseAdmin
          .from("whatsapp_connections")
          .update({ workspace_id: workspaceId })
          .eq("id", connectionId);
      }
    }

    // Número ainda não cadastrado: cria a conexão para que o Atendimento
    // receba as mensagens de qualquer número conectado à nossa WABA.
    if (!connectionId && workspaceId) {
      const label = value?.metadata?.display_phone_number ?? String(phoneNumberId);
      const { data: created } = await supabaseAdmin
        .from("whatsapp_connections")
        .insert({
          workspace_id: workspaceId,
          name: label,
          phone_number_id: String(phoneNumberId),
          waba_id: wabaId ? String(wabaId) : null,
          display_phone: value?.metadata?.display_phone_number ?? null,
          nome_interno: label,
          provider: "meta_cloud",
          status: "ativo",
          use_global_token: true,
        })

        .select("id")
        .maybeSingle();
      connectionId = created?.id ?? null;
    }
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

    // Automações: status real de entrega/leitura das mensagens enviadas pelos fluxos.
    if (!rec && String(s?.biz_opaque_callback_data ?? "").startsWith("auto:")) {
      try {
        const { applyDeliveryStatus } = await import("@/lib/automation-engine.server");
        await applyDeliveryStatus(supabaseAdmin, id, status, tsIso, s?.errors ?? null);
      } catch (e) {
        console.error("automation status", e);
      }
    }

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

    // Espelha nos envios de teste do painel do cliente.
    {
      const testPatch: Record<string, any> = { status };
      if (status === "failed") {
        const err = extractError(s?.errors?.[0]);
        testPatch['error_message'] = err.reason;
        testPatch['error_code'] = err.code;
      }
      await supabaseAdmin.from("wa_test_sends").update(testPatch).eq("meta_message_id", id);
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
    const body: string = inboundMessageText(m);
    const wamid: string | null = m?.id ?? null;
    const contextWamid: string | null = m?.context?.id ? String(m.context.id) : null;

    // Dedup por wamid — se já registramos essa mensagem, ignoramos.
    if (wamid) {
      const { data: dup } = await supabaseAdmin
        .from("whatsapp_inbox")
        .select("id")
        .eq("meta_message_id", wamid)
        .maybeSingle();
      if (dup) continue;
    }

    const campaignLink = await resolveInboundCampaignLink(supabaseAdmin, {
      from,
      contextWamid,
      connectionWorkspaceId: workspaceId,
      connectionId,
    });
    const effectiveWorkspaceId = campaignLink.workspaceId ?? workspaceId;

    await supabaseAdmin.from("whatsapp_inbox").insert({
      workspace_id: effectiveWorkspaceId,
      connection_id: connectionId,
      phone: from,
      direction: "in",
      message_type: m?.type ?? "text",
      body,
      meta_message_id: wamid,
      raw: m,
    });

    if (from) {
      const repliedAt = new Date().toISOString();
      if (campaignLink.recipientId) {
        await supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "replied", replied_at: repliedAt })
          .eq("id", campaignLink.recipientId)
          .in("status", ["sent", "delivered", "read"]);
      } else {
        await supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "replied", replied_at: repliedAt })
          .in("phone", brPhoneVariants(from))
          .in("status", ["sent", "delivered", "read"]);
      }
      await supabaseAdmin
        .from("contacts")
        .update({ last_interaction_at: new Date().toISOString() })
        .in("phone", brPhoneVariants(from));

      // ── Atendimento: alimenta wa_conversations + wa_conversation_messages ──
      if (effectiveWorkspaceId) {
        try {
          await upsertConversationFromInbound(supabaseAdmin, {
            workspaceId: effectiveWorkspaceId,
            connectionId,
            phoneNumberId,
            wabaId,
            from,
            body,
            message: m,
            wamid,
            linkedCampaignId: campaignLink.campaignId,
            linkedCampaignRecipientId: campaignLink.recipientId,
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
        .in("phone", brPhoneVariants(from));
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
    linkedCampaignId?: string | null;
    linkedCampaignRecipientId?: string | null;
  },
) {
  const {
    workspaceId,
    connectionId,
    phoneNumberId,
    wabaId,
    from,
    body,
    message,
    wamid,
    linkedCampaignId,
    linkedCampaignRecipientId,
  } = args;

  // Timestamp OFICIAL da Meta (segundos epoch em string). Fallback: agora.
  const metaTsSec = Number(message?.timestamp);
  const messageDate =
    Number.isFinite(metaTsSec) && metaTsSec > 0 ? new Date(metaTsSec * 1000) : new Date();
  const messageIso = messageDate.toISOString();
  const expiresIso = new Date(messageDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const type = String(message?.type ?? "text");

  // ── (1) DEDUP ANTES DE QUALQUER SIDE EFFECT ────────────────────────
  // Se a mensagem já foi registrada (mesmo workspace + wamid), aborta sem
  // tocar em conversa, janela, unread, automação, notificação, etc.
  if (wamid) {
    const { data: dup } = await supabaseAdmin
      .from("wa_conversation_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("wamid", wamid)
      .maybeSingle();
    if (dup?.id) return;
  }

  // Preview textual (usado só quando a mensagem realmente for gravada).
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

  const profileName: string | null = message?.profile?.name ? String(message.profile.name) : null;

  // Lookups read-only (contato e última campanha vinculada ao número).
  // A Meta pode entregar o número BR sem o 9º dígito (ou com), então
  // comparamos todas as variantes plausíveis do telefone.
  const phoneCandidates = brPhoneVariants(from);
  let contactId: string | null = null;
  {
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("phone", phoneCandidates)
      .limit(1)
      .maybeSingle();
    if (c?.id) contactId = c.id;
  }
  let campaignId: string | null = linkedCampaignId ?? null;
  let campaignRecipientId: string | null = linkedCampaignRecipientId ?? null;
  if (!campaignRecipientId) {
    // workspace_id em campaign_recipients pode estar nulo em bases antigas —
    // por isso filtramos pelo workspace da campanha, não da linha.
    const { data: rows } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, workspace_id, last_attempt_at, wa_campaigns!inner(workspace_id)")
      .in("phone", phoneCandidates)
      .eq("wa_campaigns.workspace_id", workspaceId)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const r = rows?.[0];
    if (r?.id) {
      campaignRecipientId = r.id;
      campaignId = r.campaign_id ?? null;
    }
  }
  // ── (2) SHELL DA CONVERSA ──────────────────────────────────────────
  // Precisamos de um conversation_id para gravar a mensagem. Criamos/lemos
  // sem tocar em last_inbound_at nem service_window_* — esses campos só
  // são atualizados DEPOIS que o INSERT da mensagem confirmar novidade.
  let conversationId: string | null = null;
  let existingLastInboundMs = 0;
  let existingUnread = 0;
  if (connectionId) {
    const { data: existing } = await supabaseAdmin
      .from("wa_conversations")
      .select(
        "id, unread_count, contact_id, contact_name, campaign_id, campaign_recipient_id, last_inbound_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("connection_id", connectionId)
      .in("contact_phone", phoneCandidates)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      conversationId = existing.id;
      existingUnread = existing.unread_count ?? 0;
      existingLastInboundMs = existing.last_inbound_at
        ? new Date(existing.last_inbound_at as string).getTime()
        : 0;
      // Só preenche campos ausentes; NÃO mexe em janela nem contadores aqui.
      const shellPatch: Record<string, any> = {};
      if (!existing.contact_id && contactId) shellPatch.contact_id = contactId;
      if (!existing.contact_name && profileName) shellPatch.contact_name = profileName;
      if (campaignId && existing.campaign_id !== campaignId) shellPatch.campaign_id = campaignId;
      if (campaignRecipientId && existing.campaign_recipient_id !== campaignRecipientId)
        shellPatch.campaign_recipient_id = campaignRecipientId;
      if (Object.keys(shellPatch).length > 0) {
        await supabaseAdmin.from("wa_conversations").update(shellPatch).eq("id", existing.id);
      }
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
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
          unread_count: 0,
          conversation_status: "open",
          // janela e last_inbound_at ficam nulos aqui — abrimos só após
          // gravar a mensagem com sucesso (evita reabrir por duplicado).
        })
        .select("id")
        .single();
      if (insErr && (insErr as any).code === "23505") {
        // Race: outro webhook criou a conversa. Relê.
        const { data: reread } = await supabaseAdmin
          .from("wa_conversations")
          .select("id, unread_count, last_inbound_at")
          .eq("workspace_id", workspaceId)
          .eq("connection_id", connectionId)
          .in("contact_phone", phoneCandidates)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        conversationId = reread?.id ?? null;
        existingUnread = reread?.unread_count ?? 0;
        existingLastInboundMs = reread?.last_inbound_at
          ? new Date(reread.last_inbound_at as string).getTime()
          : 0;
      } else {
        conversationId = inserted?.id ?? null;
      }
    }
  }

  if (!conversationId) return;

  // ── (3) INSERT ATÔMICO DA MENSAGEM (ON CONFLICT DO NOTHING) ────────
  // A unique parcial em (workspace_id, wamid) garante idempotência
  // mesmo com dois webhooks concorrentes.
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
    sent_at: messageIso, // timestamp oficial da Meta
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
      if (lr.description && !msgRow.body) msgRow.body = String(lr.description).slice(0, 500);
    }
  } else if (type === "button") {
    // Direct Send entrega como template: o toque no botão de resposta chega como
    // type "button", com button.payload = id definido no envio e button.text = rótulo.
    msgRow.interactive_type = "button_reply";
    msgRow.interactive_button_id = message?.button?.payload ?? null;
    msgRow.interactive_button_title = message?.button?.text ?? null;
  } else if (
    type === "image" ||
    type === "video" ||
    type === "audio" ||
    type === "document" ||
    type === "sticker"
  ) {
    const media = message?.[type] ?? {};
    msgRow.media_id = media?.id ?? null;
    msgRow.media_mime = media?.mime_type ?? null;
    msgRow.media_caption = media?.caption ?? null;
    msgRow.media_filename = media?.filename ?? null;
  }
  if (message?.context?.id) msgRow.context_wamid = String(message.context.id);

  const { data: insertedMsg, error: insertErr } = await supabaseAdmin
    .from("wa_conversation_messages")
    .insert(msgRow)
    .select("id")
    .maybeSingle();

  // Duplicado (race entre dois webhooks do mesmo wamid) → aborta sem side effects.
  if (insertErr && (insertErr as any).code === "23505") return;
  if (insertErr) {
    await supabaseAdmin.from("whatsapp_webhook_logs").insert({
      connection_id: connectionId,
      event_type: "conversation_msg_insert_error",
      processed: false,
      error: (insertErr as any).message ?? "insert failed",
      payload: { wamid },
    });
    return;
  }
  if (!insertedMsg?.id) return; // defensivo: sem linha inserida = sem efeitos

  // ── (4) SIDE EFFECTS — SOMENTE SE A MENSAGEM FOI REALMENTE INSERIDA ─
  // GREATEST(last_inbound_at, incoming): mensagem antiga entra no
  // histórico mas NÃO renova/reduz a janela.
  const isNewest = messageDate.getTime() > existingLastInboundMs;
  const convPatch: Record<string, any> = {
    unread_count: existingUnread + 1,
    last_message_at: isNewest ? messageIso : nowIso,
    last_message_preview: preview.slice(0, 500),
  };
  if (isNewest) {
    convPatch.last_inbound_at = messageIso;
    convPatch.service_window_opened_at = messageIso;
    convPatch.service_window_expires_at = expiresIso;
    convPatch.service_window_status = "open";
  }
  await supabaseAdmin.from("wa_conversations").update(convPatch).eq("id", conversationId);

  // Automações: respostas para esperas ativas e gatilho "mensagem recebida".
  // Evento durável deduplicado pelo wamid; falhas ficam pendentes para o scheduler.
  if (isNewest) {
    try {
      const { onInboundMessage } = await import("@/lib/automation-engine.server");
      await onInboundMessage(supabaseAdmin, {
        workspaceId,
        connectionId,
        from,
        text: String(msgRow.interactive_button_title ?? msgRow.interactive_list_title ?? body ?? ""),
        buttonId: msgRow.interactive_button_id ?? msgRow.interactive_list_id ?? null,
        buttonTitle: msgRow.interactive_button_title ?? msgRow.interactive_list_title ?? null,
        wamid,
      });
    } catch (e) {
      console.error("automation inbound", e);
    }
  }

  // Fluxo de resposta automática: só dispara para a mensagem mais nova
  // (mensagens fora de ordem não devem re-executar automação).
  let campaignFlowSent = false;
  if (campaignId && isNewest) {
    try {
      campaignFlowSent = await applyResponseFlow(supabaseAdmin, {
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

  // Resposta automática global do atendimento (fora de disparo): dispara
  // apenas quando o fluxo da campanha NÃO respondeu.
  if (!campaignFlowSent && isNewest) {
    try {
      await applyAttendanceAutoReply(supabaseAdmin, {
        workspaceId,
        conversationId,
        connectionId,
        phoneNumberId,
        from,
        inboundWamid: wamid,
      });
    } catch (e: any) {
      await supabaseAdmin.from("whatsapp_webhook_logs").insert({
        connection_id: connectionId,
        event_type: "attendance_auto_reply_error",
        processed: false,
        error: e?.message ?? "attendance auto reply failed",
        payload: { conversation_id: conversationId },
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
    inboundWamid?: string | null;
  },
): Promise<boolean> {
  const {
    workspaceId,
    conversationId,
    connectionId,
    phoneNumberId,
    from,
    campaignId,
    inboundWamid,
  } = args;

  const { data: camp } = await supabaseAdmin
    .from("wa_campaigns")
    .select("id, response_flow_enabled, response_flow_config")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp?.response_flow_enabled) return false;
  const cfg = (camp.response_flow_config ?? {}) as {
    auto_reply_text?: string | null;
    assign_status?: string | null;
    tags?: string[] | null;
    cooldown_minutes?: number | null;
    cta_enabled?: boolean | null;
    cta_button_text?: string | null;
    cta_url?: string | null;
    cta_header?: string | null;
    cta_footer?: string | null;
  };

  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, tags, metadata, conversation_status")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return false;

  const meta = (conv.metadata ?? {}) as Record<string, any>;
  const lastAutoAt = meta.last_auto_reply_at ? Date.parse(meta.last_auto_reply_at) : 0;
  const cooldownMs = Math.max(0, cfg.cooldown_minutes ?? 60) * 60 * 1000;
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
  const ctaEnabled = !!(
    cfg.cta_enabled &&
    (cfg.cta_button_text ?? "").trim() &&
    (cfg.cta_url ?? "").trim()
  );
  const hasContent = ctaEnabled || !!text;
  if (!hasContent || !cooldownOk || !connectionId || !phoneNumberId) return false;

  const idem = inboundWamid
    ? `flow:${conversationId}:${inboundWamid}`
    : `flow:${conversationId}:${Math.floor(now / (cooldownMs || 1))}`;

  let messageType: string;
  let body: string;
  let payload: Record<string, any>;
  if (ctaEnabled) {
    messageType = "interactive";
    body = text || (cfg.cta_header ?? "").trim() || (cfg.cta_button_text ?? "").trim();
    payload = {
      kind: "interactive_cta_url",
      body: text || (cfg.cta_button_text ?? "").trim(),
      display_text: (cfg.cta_button_text ?? "").trim(),
      url: (cfg.cta_url ?? "").trim(),
      header: (cfg.cta_header ?? "").trim() || undefined,
      footer: (cfg.cta_footer ?? "").trim() || undefined,
      source: "response_flow",
    };
  } else {
    messageType = "text";
    body = text;
    payload = { kind: "text", body: text, source: "response_flow" };
  }

  const { data: msg } = await supabaseAdmin
    .from("wa_conversation_messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: "outbound",
      origin: "auto_flow",
      message_type: messageType,
      body,
      status: "queued",
      payload,
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
    payload,
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
      last_message_preview: (body || text || "").slice(0, 500),
      metadata: { ...meta, last_auto_reply_at: nowIso },
    })
    .eq("id", conversationId);
  return true;
}

// ────────────────────────────────────────────────────────────────────
// applyAttendanceAutoReply — resposta automática GLOBAL do atendimento
// (wa_attendance_settings), usada quando a mensagem inbound NÃO é
// respondida pelo fluxo de resposta de uma campanha (fora de disparo).
// Envia APENAS na primeira mensagem recebida daquele número:
// - se a conversa já recebeu resposta automática antes → não envia
// - se já existe qualquer mensagem inbound anterior na conversa → não envia
// ────────────────────────────────────────────────────────────────────
async function applyAttendanceAutoReply(
  supabaseAdmin: any,
  args: {
    workspaceId: string;
    conversationId: string;
    connectionId: string | null;
    phoneNumberId: string | null;
    from: string;
    inboundWamid?: string | null;
  },
): Promise<boolean> {
  const { workspaceId, conversationId, connectionId, phoneNumberId, from, inboundWamid } = args;
  if (!connectionId || !phoneNumberId) return false;

  const { data: settings } = await supabaseAdmin
    .from("wa_attendance_settings")
    .select(
      "auto_reply_enabled, auto_reply_text, auto_reply_cooldown_minutes, auto_reply_cta_enabled, auto_reply_cta_button_text, auto_reply_cta_url",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!settings?.auto_reply_enabled) return false;

  const text = String(settings.auto_reply_text ?? "").trim();
  const ctaEnabled = !!(
    settings.auto_reply_cta_enabled &&
    String(settings.auto_reply_cta_button_text ?? "").trim() &&
    String(settings.auto_reply_cta_url ?? "").trim()
  );
  if (!text && !ctaEnabled) return false;

  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, metadata, contact_name")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return false;

  const meta = (conv.metadata ?? {}) as Record<string, any>;
  // Só na PRIMEIRA mensagem do número: se já respondemos antes, nunca mais.
  if (meta.last_attendance_reply_at) return false;

  // Se já existe qualquer outra mensagem inbound anterior na conversa,
  // não é a primeira → não envia.
  let inboundQuery = supabaseAdmin
    .from("wa_conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound");
  if (inboundWamid) inboundQuery = inboundQuery.neq("wamid", inboundWamid);
  const { count: priorInbound } = await inboundQuery;
  if ((priorInbound ?? 0) > 0) return false;

  const cooldownMs =
    Math.max(1, Number(settings.auto_reply_cooldown_minutes ?? 60)) * 60 * 1000;
  const now = Date.now();

  const contactName = String(conv.contact_name ?? "").trim();
  const render = (s: string) =>
    s.replaceAll("{nome}", contactName || from).replaceAll("{{nome}}", contactName || from);
  const renderedText = render(text);

  const idem = inboundWamid
    ? `attflow:${conversationId}:${inboundWamid}`
    : `attflow:${conversationId}:${Math.floor(now / (cooldownMs || 1))}`;

  let messageType: string;
  let body: string;
  let payload: Record<string, any>;
  if (ctaEnabled) {
    messageType = "interactive";
    body = renderedText || render(String(settings.auto_reply_cta_button_text ?? "").trim());
    payload = {
      kind: "interactive_cta_url",
      body: renderedText || body,
      display_text: render(String(settings.auto_reply_cta_button_text ?? "").trim()),
      url: String(settings.auto_reply_cta_url ?? "").trim(),
      source: "attendance_auto_reply",
    };
  } else {
    messageType = "text";
    body = renderedText;
    payload = { kind: "text", body: renderedText, source: "attendance_auto_reply" };
  }

  const { data: msg } = await supabaseAdmin
    .from("wa_conversation_messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: "outbound",
      origin: "auto_flow",
      message_type: messageType,
      body,
      status: "queued",
      payload,
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
    payload,
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
      last_message_preview: body.slice(0, 500),
      metadata: { ...meta, last_attendance_reply_at: nowIso },
    })
    .eq("id", conversationId);
  return true;
}
