import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

// ── Diagnose current token ─────────────────────────────────────────────────
export const debugToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { debugAccessToken } = await import("@/lib/wa-meta.server");
    const r = await debugAccessToken();
    if (!r.ok) throw new Error(r.error);
    const required = ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"];
    const missing = required.filter((s) => !r.data.scopes.includes(s));
    return {
      ok: true,
      app_id: r.data.app_id,
      user_id: r.data.user_id,
      type: r.data.type,
      expires_at: r.data.expires_at,
      is_valid: r.data.is_valid,
      scopes: r.data.scopes,
      missing_scopes: missing,
    };
  });

// ── Import WABAs from a Business Manager ID into whatsapp_wabas ────────────
export const importWabasFromBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      business_id: z.string().trim().min(1),
      workspace_id: z.string().uuid().optional().nullable(),
      client_id: z.string().uuid().optional().nullable(),
      project_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { listOwnedWabas } = await import("@/lib/wa-meta.server");
    const wabas = await listOwnedWabas(data.business_id);
    let created = 0, updated = 0;
    for (const w of wabas) {
      const { data: existing } = await context.supabase
        .from("whatsapp_wabas").select("id").eq("waba_id", w.id).maybeSingle();
      if (existing) {
        await context.supabase.from("whatsapp_wabas").update({
          nome_interno: w.name || existing.nome_interno || `WABA ${w.id}`,
          business_id: data.business_id,
        }).eq("id", existing.id);
        updated++;
      } else {
        await context.supabase.from("whatsapp_wabas").insert({
          nome_interno: w.name || `WABA ${w.id}`,
          waba_id: w.id,
          business_id: data.business_id,
          workspace_id: data.workspace_id ?? null,
          client_id: data.client_id ?? null,
          project_id: data.project_id ?? null,
          status: "ativo",
        });
        created++;
      }
    }
    return { total: wabas.length, created, updated };
  });

// ── Create a brand-new WABA on Meta and persist locally ────────────────────
export const createWabaViaApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      business_id: z.string().trim().min(1),
      name: z.string().trim().min(1).max(120),
      timezone_id: z.string().optional(),
      currency: z.string().optional(),
      workspace_id: z.string().uuid().optional().nullable(),
      client_id: z.string().uuid().optional().nullable(),
      project_id: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { createWabaOnMeta } = await import("@/lib/wa-meta.server");
    const r = await createWabaOnMeta({
      businessId: data.business_id,
      name: data.name,
      timezoneId: data.timezone_id,
      currency: data.currency,
    });
    if (!r.ok) throw new Error(r.error);
    const { data: row, error } = await context.supabase.from("whatsapp_wabas").insert({
      nome_interno: data.name,
      waba_id: r.data.id,
      business_id: data.business_id,
      workspace_id: data.workspace_id ?? null,
      client_id: data.client_id ?? null,
      project_id: data.project_id ?? null,
      status: "ativo",
    }).select().single();
    if (error) throw error;
    return { waba_id: r.data.id, row };
  });

// ── Add / verify / register a phone number ─────────────────────────────────
export const addNumberToWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      waba_ref_id: z.string().uuid(),
      cc: z.string().trim().min(1).max(4),
      phone_number: z.string().trim().min(6),
      verified_name: z.string().trim().min(1).max(120),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: waba } = await context.supabase.from("whatsapp_wabas")
      .select("id,waba_id,business_id,workspace_id,client_id,project_id").eq("id", data.waba_ref_id).single();
    if (!waba?.waba_id) throw new Error("WABA não encontrada.");
    const { addPhoneToWaba } = await import("@/lib/wa-meta.server");
    const r = await addPhoneToWaba({
      wabaId: waba.waba_id,
      cc: data.cc,
      phone_number: data.phone_number,
      verified_name: data.verified_name,
    });
    if (!r.ok) throw new Error(r.error);
    const display = `+${data.cc} ${data.phone_number}`;
    const { data: conn, error } = await context.supabase.from("whatsapp_connections").insert({
      name: data.verified_name,
      display_phone: display,
      phone: display,
      phone_number_id: r.data.id,
      waba_id: waba.waba_id,
      waba_ref_id: waba.id,
      business_id: waba.business_id,
      workspace_id: waba.workspace_id,
      client_id: waba.client_id,
      project_id: waba.project_id,
      provider: "meta_cloud",
      status: "inativa",
      code_verification_status: "NOT_VERIFIED",
      meta_sync_status: "ok",
      last_seen_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    return { phone_number_id: r.data.id, connection: conn };
  });

export const requestNumberCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid(),
      code_method: z.enum(["SMS", "VOICE"]).default("SMS"),
      language: z.string().default("pt_BR"),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: conn } = await context.supabase.from("whatsapp_connections")
      .select("phone_number_id").eq("id", data.connection_id).single();
    if (!conn?.phone_number_id) throw new Error("Phone Number ID ausente.");
    const { requestPhoneCode } = await import("@/lib/wa-meta.server");
    const r = await requestPhoneCode({
      phoneNumberId: conn.phone_number_id, code_method: data.code_method, language: data.language,
    });
    if (!r.ok) throw new Error(r.error);
    return { ok: true };
  });

export const verifyNumberCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ connection_id: z.string().uuid(), code: z.string().trim().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: conn } = await context.supabase.from("whatsapp_connections")
      .select("phone_number_id").eq("id", data.connection_id).single();
    if (!conn?.phone_number_id) throw new Error("Phone Number ID ausente.");
    const { verifyPhoneCode } = await import("@/lib/wa-meta.server");
    const r = await verifyPhoneCode({ phoneNumberId: conn.phone_number_id, code: data.code });
    if (!r.ok) throw new Error(r.error);
    await context.supabase.from("whatsapp_connections")
      .update({ code_verification_status: "VERIFIED" }).eq("id", data.connection_id);
    return { ok: true };
  });

export const registerNumberOnCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ connection_id: z.string().uuid(), pin: z.string().trim().regex(/^\d{6}$/, "PIN deve ter 6 dígitos") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: conn } = await context.supabase.from("whatsapp_connections")
      .select("phone_number_id").eq("id", data.connection_id).single();
    if (!conn?.phone_number_id) throw new Error("Phone Number ID ausente.");
    const { registerPhone } = await import("@/lib/wa-meta.server");
    const r = await registerPhone({ phoneNumberId: conn.phone_number_id, pin: data.pin });
    if (!r.ok) throw new Error(r.error);
    await context.supabase.from("whatsapp_connections")
      .update({ status: "ativa", meta_sync_status: "ok" }).eq("id", data.connection_id);
    return { ok: true };
  });

// ── Duplicate a template locally (creates copy with `_copy` suffix) ────────
export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template_id: z.string().uuid(),
    new_name: z.string().trim().min(1).max(120).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: t, error } = await context.supabase.from("whatsapp_templates")
      .select("*").eq("id", data.template_id).single();
    if (error) throw error;
    const {
      id: _id, created_at: _c, updated_at: _u, meta_template_id: _m, submitted_at: _s, approved_at: _a,
      status: _st, ...rest
    } = t as any;
    const newName = data.new_name || `${t.name}_copy`;
    const { data: row, error: e2 } = await context.supabase.from("whatsapp_templates").insert({
      ...rest, name: newName, status: "rascunho", meta_template_id: null,
      submitted_at: null, approved_at: null,
    }).select().single();
    if (e2) throw e2;
    return row;
  });
