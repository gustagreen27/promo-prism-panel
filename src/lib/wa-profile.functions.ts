import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { META_GRAPH, MetaError, metaFetch, metaFetchRaw } from "@/lib/meta/meta-client.server";
import { loadConnectionSecure, type LoadedConnection } from "@/lib/meta/wa-token-resolver.server";
import { auditProfileEvent } from "@/lib/meta/wa-profile-audit.server";

const PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";
const PHONE_FIELDS =
  "verified_name,name_status,new_display_name,new_name_status,display_phone_number,code_verification_status,quality_rating";

// ── util: locks in-memory (por instância) para evitar concorrência óbvia
const inflight = new Map<string, Promise<any>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) throw new Error("Outra operação está em andamento para este número. Aguarde.");
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return await p;
}

async function updateConnectionDisplayName(conn: LoadedConnection, phone: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const status = phone?.new_name_status || phone?.name_status || null;
  const patch: any = {
    current_display_name: phone?.verified_name ?? null,
    requested_display_name: phone?.new_display_name ?? null,
    display_name_status: status,
    last_meta_sync_at: new Date().toISOString(),
  };
  if (phone?.new_name_status === "APPROVED") patch.display_name_reviewed_at = new Date().toISOString();
  if (phone?.new_name_status === "DECLINED") {
    patch.display_name_reviewed_at = new Date().toISOString();
    patch.display_name_rejection_reason = phone?.new_name_status_reason ?? "Rejeitado pela Meta";
  }
  await supabaseAdmin.from("whatsapp_connections").update(patch).eq("id", conn.id);
}

// ── Business Profile ──────────────────────────────────────────────────────
export const getPhoneProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    const headers = { Authorization: `Bearer ${conn.access_token}` };
    const connectionMeta = {
      id: conn.id,
      workspace_id: conn.workspace_id,
      waba_id: conn.waba_id,
      phone_number_id: conn.phone_number_id,
      use_global_token: conn.use_global_token,
      current_display_name: conn.current_display_name,
      requested_display_name: conn.requested_display_name,
      display_name_status: conn.display_name_status,
    };
    try {
      const profileJson = await metaFetch(
        `/${conn.phone_number_id}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`,
        { headers },
      );
      const phoneJson = await metaFetch(`/${conn.phone_number_id}?fields=${PHONE_FIELDS}`, { headers });
      try { await updateConnectionDisplayName(conn, phoneJson); } catch {}
      return {
        profile: profileJson?.data?.[0] ?? {},
        phone: phoneJson,
        connection: connectionMeta,
        meta_error: null as null | { code?: number; subcode?: number; message: string; type?: string; hint: string },
      };
    } catch (e: any) {
      // Meta rejeitou o phone_number_id — devolve payload amigável em vez de derrubar a página.
      const isMeta = e instanceof MetaError;
      const code = isMeta ? (e as MetaError).code : undefined;
      const subcode = isMeta ? (e as MetaError).subcode : undefined;
      const message = isMeta ? (e as MetaError).message : (e?.message ?? "Erro desconhecido ao consultar a Meta.");
      const tokenOrigin = conn.use_global_token ? "token global (WHATSAPP_ACCESS_TOKEN)" : "token da conexão";
      const hint =
        code === 100 || /does not exist|missing permissions/i.test(message)
          ? `A Meta não reconhece o phone_number_id "${conn.phone_number_id}" com o ${tokenOrigin}. Verifique se: (1) o Phone Number ID está correto e ativo; (2) o token pertence ao mesmo Business Manager/WABA (${conn.waba_id ?? "sem WABA"}); (3) o System User tem acesso à WABA e possui as permissões whatsapp_business_management e whatsapp_business_messaging. Use "Testar conexão" para um diagnóstico completo.`
          : `Falha ao consultar o perfil na Meta usando o ${tokenOrigin}. Use "Testar conexão" para diagnóstico.`;
      return {
        profile: {},
        phone: {},
        connection: connectionMeta,
        meta_error: { code, subcode, message, type: isMeta ? (e as MetaError).type : undefined, hint },
      };
    }
  });


export const updatePhoneProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      about: z.string().max(139).optional(),
      description: z.string().max(512).optional(),
      address: z.string().max(256).optional(),
      email: z.string().email().max(128).optional().or(z.literal("")),
      websites: z.array(z.string().url()).max(2).optional(),
      vertical: z.string().max(64).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    return await withLock(`profile:${conn.phone_number_id}`, async () => {
      // Snapshot anterior
      let previous: any = null;
      try {
        previous = await metaFetch(
          `/${conn.phone_number_id}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`,
          { headers: { Authorization: `Bearer ${conn.access_token}` } },
        );
        previous = previous?.data?.[0] ?? null;
      } catch {}

      const body: any = { messaging_product: "whatsapp" };
      for (const k of ["about", "description", "address", "vertical"] as const) {
        if (data[k] !== undefined) body[k] = data[k];
      }
      if (data.email !== undefined) body.email = data.email || "";
      if (data.websites !== undefined) body.websites = data.websites.filter(Boolean);

      try {
        await metaFetch(`/${conn.phone_number_id}/whatsapp_business_profile`, {
          method: "POST",
          headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "PROFILE_UPDATED",
          previous_value: previous, new_value: body,
        });
        return { ok: true };
      } catch (e) {
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "PROFILE_UPDATED",
          previous_value: previous, new_value: body, error: e,
        });
        throw e;
      }
    });
  });

// ── Profile picture upload ─────────────────────────────────────────────────
const MAX_IMG = 5 * 1024 * 1024;

function detectMime(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length < 8) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  return null;
}

export const uploadPhoneProfilePicture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      file_base64: z.string().min(10),
      file_name: z.string().max(200).default("perfil.jpg"),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error("META_APP_ID não configurado.");
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);

    return await withLock(`picture:${conn.phone_number_id}`, async () => {
      const b64 = data.file_base64.includes(",") ? data.file_base64.split(",")[1] : data.file_base64;
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const size = bin.byteLength;
      if (size > MAX_IMG) throw new Error("Imagem muito grande (máx 5 MB).");
      if (size < 100) throw new Error("Arquivo inválido.");
      const mime = detectMime(bin);
      if (!mime) throw new Error("Arquivo inválido. Use JPEG ou PNG.");
      const cleanName = data.file_name.replace(/[^\w.\-]/g, "_").slice(0, 100);

      try {
        // Session
        const sess = await metaFetch(
          `/${appId}/uploads?file_name=${encodeURIComponent(cleanName)}&file_length=${size}&file_type=${encodeURIComponent(mime)}`,
          { method: "POST", headers: { Authorization: `Bearer ${conn.access_token}` } },
        );
        const sessionId: string = sess.id;
        if (!sessionId) throw new Error("Sessão de upload inválida.");

        // Bytes
        const upRes = await metaFetchRaw(`/${sessionId}`, {
          method: "POST",
          headers: {
            Authorization: `OAuth ${conn.access_token}`,
            file_offset: "0",
            "Content-Type": "application/octet-stream",
          },
          body: bin,
          timeoutMs: 120_000,
        });
        const upJson: any = await upRes.json().catch(() => ({}));
        if (!upRes.ok) throw new MetaError(upJson?.error ?? { message: "Falha no upload" }, upRes.status, `${META_GRAPH}/${sessionId}`);
        const handle: string | undefined = upJson.h;
        if (!handle) throw new Error("Handle da imagem não retornado pela Meta.");

        await metaFetch(`/${conn.phone_number_id}/whatsapp_business_profile`, {
          method: "POST",
          headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: handle }),
        });
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "PROFILE_PICTURE_UPDATED",
          new_value: { size, mime, file_name: cleanName },
        });
        return { ok: true };
      } catch (e) {
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "PROFILE_PICTURE_UPDATED",
          new_value: { size, mime }, error: e,
        });
        throw e;
      }
    });
  });

// ── Display name ─────────────────────────────────────────────────────
export const requestDisplayNameChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      new_display_name: z.string().trim().min(1).max(120),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    return await withLock(`dn-request:${conn.phone_number_id}`, async () => {
      if (
        conn.requested_display_name &&
        conn.display_name_status === "PENDING_REVIEW" &&
        conn.requested_display_name.toLowerCase() === data.new_display_name.toLowerCase()
      ) {
        throw new Error("Este nome já está em análise pela Meta.");
      }
      try {
        await metaFetch(
          `/${conn.phone_number_id}?new_display_name=${encodeURIComponent(data.new_display_name)}`,
          { method: "POST", headers: { Authorization: `Bearer ${conn.access_token}` } },
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("whatsapp_connections").update({
          requested_display_name: data.new_display_name,
          display_name_status: "PENDING_REVIEW",
          display_name_requested_at: new Date().toISOString(),
          display_name_rejection_reason: null,
        }).eq("id", conn.id);
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "DISPLAY_NAME_REQUESTED",
          previous_value: { requested: conn.requested_display_name },
          new_value: { requested: data.new_display_name },
        });
        return { ok: true };
      } catch (e) {
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "DISPLAY_NAME_REQUESTED",
          new_value: { requested: data.new_display_name }, error: e,
        });
        throw e;
      }
    });
  });

const RATE_LIMIT_WINDOW_MIN = 15;
const RATE_LIMIT_MAX = 3;

export const applyDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      pin: z.string().regex(/^\d{6}$/, "PIN deve ter 6 dígitos"),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    return await withLock(`dn-apply:${conn.phone_number_id}`, async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Rate limit por número
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from("whatsapp_display_name_attempts")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", conn.id)
        .gte("created_at", since);
      if ((count ?? 0) >= RATE_LIMIT_MAX) {
        throw new Error(`Muitas tentativas. Aguarde ${RATE_LIMIT_WINDOW_MIN} minutos.`);
      }

      let ok = false;
      try {
        await metaFetch(`/${conn.phone_number_id}/register`, {
          method: "POST",
          headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", pin: data.pin }),
        });
        ok = true;
        await supabaseAdmin.from("whatsapp_connections").update({
          display_name_applied_at: new Date().toISOString(),
          current_display_name: conn.requested_display_name ?? conn.current_display_name,
        }).eq("id", conn.id);
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "DISPLAY_NAME_APPLIED",
          new_value: { current: conn.requested_display_name ?? conn.current_display_name },
        });
        return { ok: true };
      } catch (e) {
        await auditProfileEvent({
          workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
          user_id: context.userId, action: "DISPLAY_NAME_APPLIED", error: e,
        });
        throw e;
      } finally {
        await supabaseAdmin.from("whatsapp_display_name_attempts").insert({
          connection_id: conn.id, user_id: context.userId, success: ok,
        });
      }
    });
  });

// ── Diagnóstico ──────────────────────────────────────────────────────
export const diagnoseConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
    let conn: LoadedConnection | null = null;
    try {
      conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
      results.push({ step: "Token encontrado", ok: true, detail: conn.use_global_token ? "global" : "conexão" });
    } catch (e: any) {
      results.push({ step: "Token encontrado", ok: false, detail: e?.message });
      return { ok: false, results };
    }
    const headers = { Authorization: `Bearer ${conn.access_token}` };
    const appId = process.env.META_APP_ID;
    // Token válido + App
    try {
      const debug = await metaFetch(
        `/debug_token?input_token=${encodeURIComponent(conn.access_token)}`,
        { headers },
      );
      const d = debug?.data ?? {};
      results.push({ step: "Token válido", ok: !!d.is_valid, detail: d.is_valid ? `expira em ${d.expires_at || "—"}` : "inválido" });
      results.push({
        step: "App ID correspondente",
        ok: !appId || String(d.app_id ?? "") === String(appId),
        detail: `app_id=${d.app_id ?? "?"}`,
      });
      const scopes: string[] = d.scopes ?? [];
      const need = ["whatsapp_business_management", "whatsapp_business_messaging"];
      results.push({
        step: "Permissões",
        ok: need.every((s) => scopes.includes(s)),
        detail: scopes.join(", ") || "—",
      });
    } catch (e: any) {
      results.push({ step: "Token válido", ok: false, detail: e?.message });
    }
    // WABA
    if (conn.waba_id) {
      try {
        await metaFetch(`/${conn.waba_id}?fields=id,name`, { headers });
        results.push({ step: "Acesso à WABA", ok: true });
      } catch (e: any) {
        results.push({ step: "Acesso à WABA", ok: false, detail: e?.message });
      }
    }
    // Número + perfil
    try {
      const phone = await metaFetch(`/${conn.phone_number_id}?fields=${PHONE_FIELDS}`, { headers });
      results.push({ step: "Acesso ao número", ok: true, detail: phone.display_phone_number });
      results.push({ step: "Status do nome", ok: true, detail: phone.name_status ?? "—" });
    } catch (e: any) {
      results.push({ step: "Acesso ao número", ok: false, detail: e?.message });
    }
    try {
      await metaFetch(`/${conn.phone_number_id}/whatsapp_business_profile?fields=about`, { headers });
      results.push({ step: "Consulta do perfil", ok: true });
    } catch (e: any) {
      results.push({ step: "Consulta do perfil", ok: false, detail: e?.message });
    }
    // Último webhook recebido
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: last } = await supabaseAdmin
        .from("whatsapp_webhook_logs")
        .select("created_at,event_type")
        .order("created_at", { ascending: false })
        .limit(1);
      results.push({
        step: "Último webhook",
        ok: !!last?.[0],
        detail: last?.[0] ? `${last[0].event_type} · ${new Date(last[0].created_at).toLocaleString("pt-BR")}` : "nunca recebido",
      });
    } catch {}

    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
      user_id: context.userId, action: "CONNECTION_DIAGNOSED",
      new_value: { results },
    });

    return { ok: results.every((r) => r.ok), results };
  });

// ── Histórico de auditoria ────────────────────────────────────────────
export const listProfileAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid(), limit: z.number().int().max(100).default(30) }).parse(d))
  .handler(async ({ data, context }) => {
    // reuse auth check
    await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("whatsapp_profile_audit_logs")
      .select("*")
      .eq("connection_id", data.connection_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return { rows: rows ?? [] };
  });
