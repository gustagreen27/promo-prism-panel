import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function loadConnection(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("id, phone_number_id, waba_id, access_token")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!data?.phone_number_id) throw new Error("Phone Number ID ausente nesta conexão.");
  const token = (data as any).access_token || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("Access token não configurado (conexão ou WHATSAPP_ACCESS_TOKEN).");
  return { conn: data as any, token: token as string };
}

function metaError(json: any, status: number) {
  const msg = json?.error?.message || `HTTP ${status}`;
  const code = json?.error?.code;
  return new Error(code ? `[${code}] ${msg}` : msg);
}

// ── Business Profile ──────────────────────────────────────────────────────
export const getPhoneProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { conn, token } = await loadConnection(context.supabase, data.connection_id);
    const fields = "about,address,description,email,profile_picture_url,websites,vertical";
    const res = await fetch(`${GRAPH}/${conn.phone_number_id}/whatsapp_business_profile?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw metaError(json, res.status);
    const profile = (json?.data?.[0]) || {};

    // Also fetch name status
    const res2 = await fetch(
      `${GRAPH}/${conn.phone_number_id}?fields=verified_name,name_status,new_display_name,new_name_status,display_phone_number,code_verification_status,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json2: any = await res2.json().catch(() => ({}));
    if (!res2.ok) throw metaError(json2, res2.status);

    return { profile, phone: json2 };
  });

export const updatePhoneProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      about: z.string().max(139).optional(),
      description: z.string().max(512).optional(),
      address: z.string().max(256).optional(),
      email: z.string().max(128).optional(),
      websites: z.array(z.string().url()).max(2).optional(),
      vertical: z.string().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { conn, token } = await loadConnection(context.supabase, data.connection_id);
    const body: any = { messaging_product: "whatsapp" };
    for (const k of ["about", "description", "address", "email", "vertical"] as const) {
      if (data[k] !== undefined) body[k] = data[k];
    }
    if (data.websites !== undefined) body.websites = data.websites.filter(Boolean);
    const res = await fetch(`${GRAPH}/${conn.phone_number_id}/whatsapp_business_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw metaError(json, res.status);
    return { ok: true };
  });

// ── Profile picture upload (3-step Meta resumable upload) ─────────────────
export const uploadPhoneProfilePicture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      file_base64: z.string().min(10),
      file_name: z.string().default("perfil.jpg"),
      mime_type: z.string().default("image/jpeg"),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error("META_APP_ID não configurado.");
    const { conn, token } = await loadConnection(context.supabase, data.connection_id);

    // Decode base64 to bytes
    const b64 = data.file_base64.includes(",") ? data.file_base64.split(",")[1] : data.file_base64;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fileSize = bin.byteLength;
    if (fileSize > 5 * 1024 * 1024) throw new Error("Imagem muito grande (máx 5 MB).");

    // Step 1: create session
    const sessRes = await fetch(
      `${GRAPH}/${appId}/uploads?file_name=${encodeURIComponent(data.file_name)}&file_length=${fileSize}&file_type=${encodeURIComponent(data.mime_type)}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    const sessJson: any = await sessRes.json().catch(() => ({}));
    if (!sessRes.ok) throw metaError(sessJson, sessRes.status);
    const sessionId: string = sessJson.id;
    if (!sessionId) throw new Error("Sessão de upload inválida.");

    // Step 2: upload bytes
    const upRes = await fetch(`${GRAPH}/${sessionId}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: bin,
    });
    const upJson: any = await upRes.json().catch(() => ({}));
    if (!upRes.ok) throw metaError(upJson, upRes.status);
    const handle: string | undefined = upJson.h;
    if (!handle) throw new Error("Handle da imagem não retornado pela Meta.");

    // Step 3: apply handle to profile
    const applyRes = await fetch(`${GRAPH}/${conn.phone_number_id}/whatsapp_business_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: handle }),
    });
    const applyJson: any = await applyRes.json().catch(() => ({}));
    if (!applyRes.ok) throw metaError(applyJson, applyRes.status);
    return { ok: true };
  });

// ── Display name (nome de exibição) ────────────────────────────────────────
export const requestDisplayNameChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      new_display_name: z.string().trim().min(1).max(120),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { conn, token } = await loadConnection(context.supabase, data.connection_id);
    const res = await fetch(
      `${GRAPH}/${conn.phone_number_id}?new_display_name=${encodeURIComponent(data.new_display_name)}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw metaError(json, res.status);
    return { ok: true };
  });

export const applyDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      pin: z.string().regex(/^\d{6}$/, "PIN deve ter 6 dígitos"),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { conn, token } = await loadConnection(context.supabase, data.connection_id);
    const res = await fetch(`${GRAPH}/${conn.phone_number_id}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin: data.pin }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw metaError(json, res.status);
    return { ok: true };
  });
