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

// ── Diagnóstico completo da conexão Meta → WhatsApp ─────────────────────
// Executa debug_token separadamente (auth diferente) + Batch API para as
// demais chamadas. Nenhuma falha interrompe as verificações seguintes.
type CheckStatus = "success" | "warning" | "error" | "skipped";
type Check = {
  key: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  meta_error?: { code?: number; subcode?: number; type?: string; message: string; fbtrace_id?: string } | null;
};

const NEEDED_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging"];

export const diagnoseConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const checks: Check[] = [];
    const causes: string[] = [];
    const push = (c: Check) => { checks.push(c); return c; };

    // 1) Load conn / token
    let conn: LoadedConnection | null = null;
    try {
      conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    } catch (e: any) {
      push({ key: "load", label: "Carregar conexão e token", status: "error", detail: e?.message });
      causes.push("TOKEN_UNAVAILABLE");
      return { ok: false, checks, causes, token: null, connection: null, waba: null, waba_numbers: null, subscribed_apps: null, auto_fix: null };
    }
    const tokenSource: "global" | "connection" = conn.use_global_token ? "global" : "connection";
    const tokenLast6 = conn.access_token.slice(-6);
    push({ key: "load", label: "Carregar conexão e token", status: "success", detail: `Origem: ${tokenSource === "global" ? "WHATSAPP_ACCESS_TOKEN (global)" : "token da própria conexão"} · termina em …${tokenLast6}` });

    // 2) debug_token (chamada separada, exige app token quando disponível)
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const appToken = appId && appSecret ? `${appId}|${appSecret}` : conn.access_token;
    let dbg: any = null;
    try {
      const url = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(conn.access_token)}&access_token=${encodeURIComponent(appToken)}`;
      const r = await fetch(url);
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        push({ key: "debug_token", label: "debug_token (Meta)", status: "error", detail: j?.error?.message ?? `HTTP ${r.status}`, meta_error: j?.error });
        causes.push("DEBUG_TOKEN_FAILED");
      } else {
        dbg = j?.data ?? {};
        const scopes: string[] = Array.isArray(dbg.scopes) ? dbg.scopes : [];
        const missing = NEEDED_SCOPES.filter((s) => !scopes.includes(s));
        const gran = Array.isArray(dbg.granular_scopes) ? dbg.granular_scopes : [];
        const grantedBiz = new Set<string>();
        const grantedWaba = new Set<string>();
        for (const g of gran) {
          const ids: string[] = Array.isArray(g.target_ids) ? g.target_ids : [];
          if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") {
            for (const id of ids) grantedWaba.add(String(id));
          }
          if (g.scope === "business_management") for (const id of ids) grantedBiz.add(String(id));
        }

        push({ key: "token_valid", label: "Token válido", status: dbg.is_valid ? "success" : "error", detail: dbg.is_valid ? `Expira: ${dbg.expires_at ? (dbg.expires_at === 0 ? "nunca" : new Date(dbg.expires_at * 1000).toLocaleString("pt-BR")) : "?"} · Data access: ${dbg.data_access_expires_at ? new Date(dbg.data_access_expires_at * 1000).toLocaleString("pt-BR") : "?"}` : "Token inválido/expirado" });
        if (!dbg.is_valid) causes.push("TOKEN_INVALID");

        push({ key: "token_app", label: "App ID do token", status: !appId ? "warning" : (String(dbg.app_id ?? "") === String(appId) ? "success" : "error"), detail: !appId ? `token.app_id=${dbg.app_id ?? "?"} · META_APP_ID não configurado, comparação ignorada` : `token.app_id=${dbg.app_id ?? "?"} · esperado=${appId}` });
        if (appId && String(dbg.app_id ?? "") !== String(appId)) causes.push("TOKEN_WRONG_APP");

        push({ key: "token_scopes", label: "Permissões (scopes)", status: missing.length === 0 ? "success" : "error", detail: missing.length === 0 ? scopes.join(", ") : `Faltando: ${missing.join(", ")} · Presentes: ${scopes.join(", ") || "nenhuma"}` });
        if (missing.length) causes.push("SCOPES_MISSING");

        push({ key: "token_granular", label: "WABAs cobertas pelo token (granular_scopes)", status: (grantedWaba.size === 0) ? "warning" : (conn.waba_id && grantedWaba.has(String(conn.waba_id)) ? "success" : "error"), detail: grantedWaba.size === 0 ? "Token não expõe granular_scopes de WhatsApp (comum em tokens do System User de longa duração — verificar via /{waba_id}/subscribed_apps)" : `Cobre: ${Array.from(grantedWaba).join(", ")}` });
        if (conn.waba_id && grantedWaba.size > 0 && !grantedWaba.has(String(conn.waba_id))) causes.push("TOKEN_MISSING_WABA_GRANT");

        push({ key: "token_biz", label: "Businesses cobertos pelo token", status: grantedBiz.size ? "success" : "warning", detail: grantedBiz.size ? Array.from(grantedBiz).join(", ") : "sem business_management explícito" });
      }
    } catch (e: any) {
      push({ key: "debug_token", label: "debug_token (Meta)", status: "error", detail: e?.message ?? "Falha ao chamar debug_token" });
      causes.push("DEBUG_TOKEN_FAILED");
    }

    // 3) Batch API para o restante — não aborta se qualquer chamada falhar
    const ops: Array<{ key: string; label: string; relative_url: string }> = [
      { key: "phone", label: "Acesso ao Phone Number ID", relative_url: `${conn.phone_number_id}?fields=${PHONE_FIELDS}` },
      { key: "profile", label: "Perfil comercial (whatsapp_business_profile)", relative_url: `${conn.phone_number_id}/whatsapp_business_profile?fields=about,vertical,email` },
    ];
    if (conn.waba_id) {
      ops.push({ key: "waba", label: "Acesso à WABA", relative_url: `${conn.waba_id}?fields=id,name,currency,timezone_id,message_template_namespace,owner_business_info` });
      ops.push({ key: "waba_numbers", label: "Listar números da WABA", relative_url: `${conn.waba_id}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating` });
      ops.push({ key: "subscribed_apps", label: "Aplicativos inscritos no webhook (subscribed_apps)", relative_url: `${conn.waba_id}/subscribed_apps` });
    } else {
      push({ key: "waba", label: "Acesso à WABA", status: "error", detail: "waba_id ausente na conexão" });
      push({ key: "waba_numbers", label: "Listar números da WABA", status: "skipped", detail: "waba_id ausente" });
      push({ key: "subscribed_apps", label: "Aplicativos inscritos no webhook", status: "skipped", detail: "waba_id ausente" });
      causes.push("WABA_ID_MISSING");
    }

    let batchResp: any[] = [];
    try {
      const body = new URLSearchParams();
      body.set("access_token", conn.access_token);
      body.set("include_headers", "false");
      body.set("batch", JSON.stringify(ops.map((o) => ({ method: "GET", relative_url: o.relative_url }))));
      const r = await fetch("https://graph.facebook.com/v21.0/", { method: "POST", body });
      batchResp = await r.json().catch(() => []);
      if (!Array.isArray(batchResp)) {
        push({ key: "batch", label: "Meta Batch API", status: "error", detail: `Resposta inesperada: ${JSON.stringify(batchResp).slice(0, 200)}` });
        batchResp = [];
      }
    } catch (e: any) {
      push({ key: "batch", label: "Meta Batch API", status: "error", detail: e?.message });
    }

    const parse = (i: number) => {
      const raw = batchResp[i];
      if (!raw) return { code: 0, body: null };
      let b: any = null;
      try { b = raw.body ? JSON.parse(raw.body) : null; } catch { b = raw.body; }
      return { code: raw.code ?? 0, body: b };
    };

    let wabaData: any = null;
    let wabaNumbers: any[] | null = null;
    let subscribedApps: any[] | null = null;

    ops.forEach((op, i) => {
      const { code, body } = parse(i);
      const err = body?.error;
      const meErr = err ? { code: err.code, subcode: err.error_subcode, type: err.type, message: err.message, fbtrace_id: err.fbtrace_id } : null;

      if (op.key === "phone") {
        if (code === 200 && body?.id) {
          push({ key: op.key, label: op.label, status: "success", detail: `${body.display_phone_number ?? ""} · ${body.verified_name ?? ""} · verificação: ${body.code_verification_status ?? "?"}` });
        } else {
          push({ key: op.key, label: op.label, status: "error", detail: err?.message ?? `HTTP ${code}`, meta_error: meErr });
          if (err?.code === 100 || err?.code === 803) causes.push("PHONE_ID_NOT_ACCESSIBLE");
          else if (err?.code === 190) causes.push("TOKEN_INVALID");
          else if (err?.code === 200 || err?.code === 10) causes.push("PHONE_ID_NO_PERMISSION");
          else causes.push("PHONE_ID_ERROR");
        }
      } else if (op.key === "profile") {
        if (code === 200) {
          push({ key: op.key, label: op.label, status: "success", detail: body?.data?.[0] ? "perfil retornado" : "vazio (sem perfil configurado)" });
        } else {
          push({ key: op.key, label: op.label, status: "warning", detail: err?.message ?? `HTTP ${code}`, meta_error: meErr });
          if (err?.code === 100) causes.push("PROFILE_MISSING");
        }
      } else if (op.key === "waba") {
        if (code === 200 && body?.id) {
          wabaData = body;
          push({ key: op.key, label: op.label, status: "success", detail: `${body.name ?? "?"} (${body.id})${body.owner_business_info?.id ? ` · Business ${body.owner_business_info.id}` : ""}` });
        } else {
          push({ key: op.key, label: op.label, status: "error", detail: err?.message ?? `HTTP ${code}`, meta_error: meErr });
          if (err?.code === 100 || err?.code === 803) causes.push("WABA_NOT_ACCESSIBLE");
          else if (err?.code === 200 || err?.code === 10) causes.push("TOKEN_NO_WABA_ACCESS");
        }
      } else if (op.key === "waba_numbers") {
        if (code === 200 && Array.isArray(body?.data)) {
          wabaNumbers = body.data;
          const match = wabaNumbers!.find((n: any) => String(n.id) === String(conn!.phone_number_id));
          if (match) {
            push({ key: "phone_in_waba", label: "phone_number_id pertence à WABA", status: "success", detail: `${match.display_phone_number ?? ""} · ${match.verified_name ?? ""}` });
          } else {
            const listed = wabaNumbers!.map((n: any) => `${n.id}${n.display_phone_number ? ` (${n.display_phone_number})` : ""}`).join(", ") || "nenhum";
            push({ key: "phone_in_waba", label: "phone_number_id pertence à WABA", status: "error", detail: `${conn!.phone_number_id} NÃO está entre os números desta WABA. Encontrados: ${listed}` });
            causes.push("PHONE_ID_WRONG_WABA");
          }
          push({ key: op.key, label: op.label, status: "success", detail: `${wabaNumbers!.length} número(s)` });
        } else {
          push({ key: op.key, label: op.label, status: "error", detail: err?.message ?? `HTTP ${code}`, meta_error: meErr });
        }
      } else if (op.key === "subscribed_apps") {
        if (code === 200 && Array.isArray(body?.data)) {
          subscribedApps = body.data;
          const mine = appId ? subscribedApps!.find((a: any) => String(a?.whatsapp_business_api_data?.id ?? a?.id) === String(appId)) : null;
          if (!subscribedApps!.length) {
            push({ key: op.key, label: op.label, status: "error", detail: "Nenhum aplicativo inscrito no webhook desta WABA" });
            causes.push("APP_NOT_SUBSCRIBED");
          } else if (appId && !mine) {
            push({ key: op.key, label: op.label, status: "error", detail: `App ${appId} não está inscrito. Inscritos: ${subscribedApps!.map((a: any) => a?.whatsapp_business_api_data?.name ?? a?.whatsapp_business_api_data?.id ?? "?").join(", ")}` });
            causes.push("APP_NOT_SUBSCRIBED");
          } else {
            push({ key: op.key, label: op.label, status: "success", detail: subscribedApps!.map((a: any) => a?.whatsapp_business_api_data?.name ?? a?.whatsapp_business_api_data?.id ?? "?").join(", ") });
          }
        } else {
          push({ key: op.key, label: op.label, status: "warning", detail: err?.message ?? `HTTP ${code}`, meta_error: meErr });
        }
      }
    });

    // Último webhook recebido
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: last } = await supabaseAdmin
        .from("whatsapp_webhook_logs").select("created_at,event_type")
        .order("created_at", { ascending: false }).limit(1);
      push({ key: "webhook_last", label: "Último webhook recebido", status: last?.[0] ? "success" : "warning", detail: last?.[0] ? `${last[0].event_type} · ${new Date(last[0].created_at).toLocaleString("pt-BR")}` : "nunca" });
    } catch {}

    // Auto-fix hints
    const auto_fix: { phone_number_id?: string; waba_id?: string; needs_subscribe?: boolean } = {};
    const nums: any[] | null = wabaNumbers;
    if (causes.includes("PHONE_ID_WRONG_WABA") && nums && nums.length === 1) {
      auto_fix.phone_number_id = String(nums[0].id);
    }
    if (causes.includes("APP_NOT_SUBSCRIBED")) auto_fix.needs_subscribe = true;

    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
      user_id: context.userId, action: "CONNECTION_DIAGNOSED",
      new_value: { causes, checks: checks.map((c) => ({ k: c.key, s: c.status })) },
    });

    return {
      ok: checks.every((c) => c.status === "success" || c.status === "skipped"),
      checks,
      causes: Array.from(new Set(causes)),
      token: dbg ? {
        source: tokenSource,
        last6: tokenLast6,
        is_valid: dbg.is_valid,
        app_id: dbg.app_id,
        user_id: dbg.user_id,
        expires_at: dbg.expires_at,
        data_access_expires_at: dbg.data_access_expires_at,
        scopes: Array.isArray(dbg.scopes) ? dbg.scopes : [],
        granular_scopes: Array.isArray(dbg.granular_scopes) ? dbg.granular_scopes : [],
      } : { source: tokenSource, last6: tokenLast6, scopes: [] },
      connection: {
        id: conn.id, workspace_id: conn.workspace_id,
        phone_number_id: conn.phone_number_id, waba_id: conn.waba_id,
      },
      waba: wabaData,
      waba_numbers: wabaNumbers,
      subscribed_apps: subscribedApps,
      auto_fix,
    };
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
