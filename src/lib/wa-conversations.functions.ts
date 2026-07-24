// Server functions for the WhatsApp attendance module.
// Every DB read uses the caller's Supabase client (RLS as user).
// Sends go through wa_service_queue and the dedicated service tick worker.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Helpers ----------

async function primaryWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces:workspaces(created_at)")
    .eq("user_id", userId)
    .order("workspaces(created_at)", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ws = (data as any)?.workspace_id;
  if (!ws) throw new Error("Sem workspace vinculado");
  return ws;
}

// ---------- List conversations ----------

export const listConversationsAtd = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", "open", "waiting", "in_progress", "resolved", "archived"]).optional(),
        window: z.enum(["all", "open", "closed"]).optional(),
        assigned: z.enum(["all", "me", "none"]).optional(),
        campaign_id: z.string().uuid().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const status = data.status ?? "all";
    const windowF = data.window ?? "all";
    const assigned = data.assigned ?? "all";
    const limit = data.limit ?? 100;
    let q = context.supabase
      .from("wa_conversations")
      .select(
        "id, contact_phone, contact_name, wa_id, connection_id, phone_number_id, campaign_id, assigned_user_id, last_message_at, last_message_preview, unread_count, conversation_status, service_window_status, service_window_expires_at, tags, updated_at",
      )
      .eq("workspace_id", wsId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (status !== "all") q = q.eq("conversation_status", status);
    if (windowF !== "all") q = q.eq("service_window_status", windowF);
    if (assigned === "me") q = q.eq("assigned_user_id", context.userId);
    if (assigned === "none") q = q.is("assigned_user_id", null);
    if (data.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`contact_phone.ilike.${s},contact_name.ilike.${s},last_message_preview.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Get one conversation with connection info ----------

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const { data: conv, error } = await context.supabase
      .from("wa_conversations")
      .select(
        "id, workspace_id, contact_id, contact_phone, contact_name, wa_id, connection_id, phone_number_id, waba_id, campaign_id, campaign_recipient_id, campaign_route_id, locked_route_id, template_id, template_name, assigned_user_id, last_inbound_at, last_outbound_at, service_window_opened_at, service_window_expires_at, service_window_status, conversation_status, unread_count, last_message_at, last_message_preview, tags, metadata, created_at, updated_at",
      )
      .eq("id", data.id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Conversa não encontrada");
    let connection: any = null;
    let campaign: any = null;
    if ((conv as any).connection_id) {
      const { data: c } = await context.supabase
        .from("whatsapp_connections")
        .select("id, phone_number, phone_number_id, waba_id, display_name, verified_name")
        .eq("id", (conv as any).connection_id)
        .maybeSingle();
      connection = c ?? null;
    }
    if ((conv as any).campaign_id) {
      const { data: c } = await context.supabase
        .from("wa_campaigns")
        .select("id, name, status")
        .eq("id", (conv as any).campaign_id)
        .maybeSingle();
      campaign = c ?? null;
    }
    return { conversation: conv, connection, campaign };
  });

// ---------- List messages ----------

export const listConversationMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("wa_conversation_messages")
      .select(
        "id, direction, origin, wamid, context_wamid, message_type, interactive_type, body, media_url, media_mime, media_caption, media_filename, interactive_button_id, interactive_button_title, interactive_list_id, interactive_list_title, template_name, status, error_code, error_message, sent_by_user_id, created_at, sent_at, delivered_at, read_at, failed_at, received_at",
      )
      .eq("workspace_id", wsId)
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Mark as read (local unread counter) ----------

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({ unread_count: 0 })
      .eq("id", data.conversation_id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Assign / set status ----------

export const setConversationAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        assigned_user_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({ assigned_user_id: data.assigned_user_id })
      .eq("id", data.conversation_id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    await context.supabase.from("wa_conversation_events").insert({
      workspace_id: wsId,
      conversation_id: data.conversation_id,
      event_type: "assigned",
      actor_user_id: context.userId,
      data: { assigned_user_id: data.assigned_user_id },
    });
    return { ok: true };
  });

export const setConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        status: z.enum(["open", "waiting", "in_progress", "resolved", "archived"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({ conversation_status: data.status })
      .eq("id", data.conversation_id)
      .eq("workspace_id", wsId);
    if (error) throw new Error(error.message);
    await context.supabase.from("wa_conversation_events").insert({
      workspace_id: wsId,
      conversation_id: data.conversation_id,
      event_type: "status_change",
      actor_user_id: context.userId,
      data: { status: data.status },
    });
    return { ok: true };
  });

// ---------- Send message (enqueue) ----------

const InteractiveButtonSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(20),
});
const InteractiveListRowSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
});
const InteractiveListSectionSchema = z.object({
  title: z.string().max(24).optional(),
  rows: z.array(InteractiveListRowSchema).min(1).max(10),
});

const OutboundSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    conversation_id: z.string().uuid(),
    body: z.string().min(1).max(4096),
    context_wamid: z.string().optional().nullable(),
  }),
  z.object({
    kind: z.literal("media"),
    conversation_id: z.string().uuid(),
    media_type: z.enum(["image", "video", "audio", "document", "sticker"]),
    link: z.string().url(),
    caption: z.string().max(1024).optional(),
    filename: z.string().optional(),
    context_wamid: z.string().optional().nullable(),
  }),
  z.object({
    kind: z.literal("interactive_buttons"),
    conversation_id: z.string().uuid(),
    body: z.string().min(1).max(1024),
    header: z.string().max(60).optional(),
    footer: z.string().max(60).optional(),
    buttons: z.array(InteractiveButtonSchema).min(1).max(3),
    context_wamid: z.string().optional().nullable(),
  }),
  z.object({
    kind: z.literal("interactive_list"),
    conversation_id: z.string().uuid(),
    body: z.string().min(1).max(1024),
    header: z.string().max(60).optional(),
    footer: z.string().max(60).optional(),
    button: z.string().min(1).max(20),
    sections: z.array(InteractiveListSectionSchema).min(1).max(10),
    context_wamid: z.string().optional().nullable(),
  }),
  z.object({
    kind: z.literal("template"),
    conversation_id: z.string().uuid(),
    template_id: z.string().uuid(),
    variables: z.record(z.string(), z.string()).optional(),
    header_value: z.string().optional(),
    button_url_param: z.string().optional(),
  }),
]);


export const sendConversationMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OutboundSchema.parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);

    const { data: conv, error: convErr } = await context.supabase
      .from("wa_conversations")
      .select(
        "id, contact_phone, connection_id, phone_number_id, service_window_status, service_window_expires_at",
      )
      .eq("id", data.conversation_id)
      .eq("workspace_id", wsId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");
    if (!(conv as any).connection_id || !(conv as any).phone_number_id) {
      throw new Error("Conversa sem número de origem definido");
    }

    const windowOpen =
      (conv as any).service_window_status === "open" &&
      (!(conv as any).service_window_expires_at ||
        new Date((conv as any).service_window_expires_at as string).getTime() > Date.now());

    if (data.kind !== "template" && !windowOpen) {
      throw new Error("Janela de 24h encerrada — envie um template aprovado.");
    }

    // Cria mensagem outbound com status 'queued' + entrada na fila (idempotency por mensagem local).
    const nowIso = new Date().toISOString();
    let bodyText: string | null = null;
    let messageType = "text";
    let mediaUrl: string | null = null;
    let mediaCaption: string | null = null;
    let mediaFilename: string | null = null;
    let templateName: string | null = null;
    let payload: any = {};

    let interactiveType: string | null = null;
    if (data.kind === "text") {
      bodyText = data.body;
      payload = { kind: "text", body: data.body, context_wamid: data.context_wamid ?? null };
    } else if (data.kind === "media") {
      messageType = data.media_type;
      mediaUrl = data.link;
      mediaCaption = data.caption ?? null;
      mediaFilename = data.filename ?? null;
      bodyText = data.caption ?? null;
      payload = {
        kind: "media",
        media_type: data.media_type,
        link: data.link,
        caption: data.caption,
        filename: data.filename,
        context_wamid: data.context_wamid ?? null,
      };
    } else if (data.kind === "interactive_buttons") {
      messageType = "interactive";
      interactiveType = "button";
      bodyText = data.body;
      payload = {
        kind: "interactive_buttons",
        body: data.body,
        header: data.header ?? null,
        footer: data.footer ?? null,
        buttons: data.buttons,
        context_wamid: data.context_wamid ?? null,
      };
    } else if (data.kind === "interactive_list") {
      messageType = "interactive";
      interactiveType = "list";
      bodyText = data.body;
      payload = {
        kind: "interactive_list",
        body: data.body,
        header: data.header ?? null,
        footer: data.footer ?? null,
        button: data.button,
        sections: data.sections,
        context_wamid: data.context_wamid ?? null,
      };
    } else {
      messageType = "template";
      // Buscar template
      const { data: tpl } = await context.supabase
        .from("whatsapp_templates")
        .select("id, name, language, status, category")
        .eq("id", data.template_id)
        .maybeSingle();
      if (!tpl) throw new Error("Template não encontrado");
      if ((tpl as any).status !== "approved") throw new Error("Template não aprovado");
      templateName = (tpl as any).name;
      bodyText = `[template] ${templateName}`;
      payload = {
        kind: "template",
        template_id: (tpl as any).id,
        template_name: (tpl as any).name,
        template_language: (tpl as any).language,
        variables: data.variables ?? {},
        header_value: data.header_value ?? null,
        button_url_param: data.button_url_param ?? null,
      };
    }


    const { data: msg, error: msgErr } = await context.supabase
      .from("wa_conversation_messages")
      .insert({
        workspace_id: wsId,
        conversation_id: data.conversation_id,
        direction: "outbound",
        origin: data.kind === "template" ? "template" : "manual",
        message_type: messageType,
        body: bodyText,
        media_url: mediaUrl,
        media_caption: mediaCaption,
        media_filename: mediaFilename,
        template_name: templateName,
        interactive_type: interactiveType,

        status: "queued",
        sent_by_user_id: context.userId,
        payload,
      })
      .select("id")
      .single();
    if (msgErr) throw new Error(msgErr.message);

    const idem = `msg:${(msg as any).id}`;
    const { error: qErr } = await context.supabase.from("wa_service_queue").insert({
      workspace_id: wsId,
      conversation_id: data.conversation_id,
      connection_id: (conv as any).connection_id,
      phone_number_id: (conv as any).phone_number_id,
      contact_phone: (conv as any).contact_phone,
      message_id: (msg as any).id,
      payload,
      idempotency_key: idem,
      priority: 3,
      origin: data.kind === "template" ? "template" : "manual",
      requested_by: context.userId,
      scheduled_at: nowIso,
      next_attempt_at: nowIso,
    });
    if (qErr) throw new Error(qErr.message);

    await context.supabase
      .from("wa_conversations")
      .update({
        last_outbound_at: nowIso,
        last_message_at: nowIso,
        last_message_preview: bodyText ?? messageType,
      })
      .eq("id", data.conversation_id);

    // Dispara worker imediatamente (best-effort)
    try {
      const url = `${process.env.SUPABASE_URL}`.replace("supabase.co", "supabase.co");
      // Chamada fire-and-forget via nossa própria rota pública é feita pelo cron;
      // aqui apenas devolvemos que enfileirou.
      void url;
    } catch {
      /* ignore */
    }

    return { ok: true, message_id: (msg as any).id };
  });

// ---------- List approved templates for the picker ----------

export const listApprovedTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ connection_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    let q = context.supabase
      .from("whatsapp_templates")
      .select("id, name, language, status, category, waba_ref_id, connection_id")
      .eq("workspace_id", wsId)
      .eq("status", "approved")
      .order("name", { ascending: true })
      .limit(500);
    if (data.connection_id) {
      const { data: conn } = await context.supabase
        .from("whatsapp_connections")
        .select("waba_id")
        .eq("id", data.connection_id)
        .maybeSingle();
      const wabaMetaId = (conn as any)?.waba_id;
      if (wabaMetaId) {
        const { data: waba } = await context.supabase
          .from("whatsapp_wabas")
          .select("id")
          .eq("waba_id", wabaMetaId)
          .maybeSingle();
        if ((waba as any)?.id) q = q.eq("waba_ref_id", (waba as any).id);
      }
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Notes ----------

export const listConversationNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("wa_internal_notes")
      .select("id, body, author_user_id, created_at")
      .eq("workspace_id", wsId)
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ conversation_id: z.string().uuid(), body: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await primaryWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase.from("wa_internal_notes").insert({
      workspace_id: wsId,
      conversation_id: data.conversation_id,
      author_user_id: context.userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
