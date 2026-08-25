/**
 * Server functions da aba "Gestão de Ativos Meta".
 * Toda a lógica de HTTP/endpoints vive em @/lib/meta/asset-manager.server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (data) return;
  const { data: staff } = await ctx.supabase.rpc("is_internal_staff", { _user: ctx.userId });
  if (!staff) throw new Error("Forbidden");
}

async function svc() {
  return await import("@/lib/meta/asset-manager.server");
}

async function creds(ctx: { supabase: any }) {
  const s = await svc();
  const c = await s.loadCreds(ctx.supabase);
  if (!c) throw new Error("Configure o Business ID e o System User Access Token no painel de conexão.");
  return c;
}

export const getMetaAssetCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await s.loadCreds(context.supabase);
    if (!c) return { configured: false, business_id: "", token_masked: "" };
    return { configured: true, business_id: c.business_id, token_masked: s.maskToken(c.access_token) };
  });

export const saveMetaAssetCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ business_id: z.string().trim().min(3), access_token: z.string().trim().min(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    await s.saveCreds(context.supabase, data);
    return { ok: true };
  });

export const testMetaAssetConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const me = await s.graph(s.ENDPOINTS.me(), c.access_token);
    if (!me.ok) return { ok: false as const, message: me.error };
    const biz = await s.graph(s.ENDPOINTS.business(c.business_id), c.access_token);
    if (!biz.ok) return { ok: false as const, message: biz.error };
    return {
      ok: true as const,
      message: `Conectado como ${me.data?.name ?? me.data?.id} — BM ${biz.data?.name ?? c.business_id}`,
      business: biz.data,
    };
  });

export const listMetaWabas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const owned = await s.graph(s.ENDPOINTS.ownedWabas(c.business_id), c.access_token);
    const client = await s.graph(s.ENDPOINTS.listWabas(c.business_id), c.access_token);
    const rows = [...(owned.ok ? owned.data?.data ?? [] : []), ...(client.ok ? client.data?.data ?? [] : [])];
    const seen = new Set<string>();
    const wabas = rows.filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    const error = !owned.ok && !client.ok ? (owned.ok ? "" : owned.error) : "";
    return { wabas, error };
  });

export const createMetaWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        currency: z.string().trim().default("BRL"),
        timezone_id: z.string().trim().default("1"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const res = await s.graph(s.ENDPOINTS.createWaba(c.business_id), c.access_token, {
      method: "POST",
      body: { name: data.name, currency: data.currency, timezone_id: data.timezone_id },
    });
    if (!res.ok) return { ok: false as const, message: res.error };
    return { ok: true as const, waba_id: String(res.data?.id ?? ""), raw: res.data };
  });

export const addMetaPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        waba_id: z.string().trim().min(3),
        cc: z.string().trim().min(1).max(4),
        phone_number: z.string().trim().min(6).max(20),
        verified_name: z.string().trim().min(2).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const res = await s.graph(s.ENDPOINTS.addPhone(data.waba_id), c.access_token, {
      method: "POST",
      body: {
        cc: data.cc.replace(/\D/g, ""),
        phone_number: data.phone_number.replace(/\D/g, ""),
        verified_name: data.verified_name,
      },
    });
    if (!res.ok) return { ok: false as const, message: res.error };
    return { ok: true as const, phone_number_id: String(res.data?.id ?? "") };
  });

export const requestMetaPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone_number_id: z.string().trim().min(3),
        code_method: z.enum(["SMS", "VOICE"]).default("SMS"),
        language: z.string().trim().default("pt_BR"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const res = await s.graph(s.ENDPOINTS.requestCode(data.phone_number_id), c.access_token, {
      method: "POST",
      body: { code_method: data.code_method, language: data.language },
    });
    return res.ok ? { ok: true as const } : { ok: false as const, message: res.error };
  });

export const verifyMetaPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone_number_id: z.string().trim().min(3),
        code: z.string().trim().regex(/^\d{6}$/u, "Código deve ter 6 dígitos"),
        pin: z.string().trim().regex(/^\d{6}$/u).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const verify = await s.graph(s.ENDPOINTS.verifyCode(data.phone_number_id), c.access_token, {
      method: "POST",
      body: { code: data.code },
    });
    if (!verify.ok) return { ok: false as const, message: verify.error };
    if (!data.pin) return { ok: true as const, message: "Número verificado. Registre com um PIN para ativar o envio." };
    const reg = await s.graph(s.ENDPOINTS.registerPhone(data.phone_number_id), c.access_token, {
      method: "POST",
      body: { messaging_product: "whatsapp", pin: data.pin },
    });
    if (!reg.ok) return { ok: false as const, message: `Verificado, mas falhou no registro: ${reg.error}` };
    return { ok: true as const, message: "Número verificado e registrado na Cloud API." };
  });

export const listMetaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ waba_id: z.string().trim().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const res = await s.graph(s.ENDPOINTS.templates(data.waba_id), c.access_token);
    if (!res.ok) return { templates: [] as any[], error: res.error };
    return { templates: (res.data?.data ?? []) as any[], error: "" };
  });

export const createMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        waba_id: z.string().trim().min(3),
        name: z
          .string()
          .trim()
          .regex(/^[a-z0-9_]{3,60}$/u, "Use apenas minúsculas, números e _"),
        category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
        language: z.string().trim().min(2).max(10),
        body: z.string().trim().min(2).max(1024),
        footer: z.string().trim().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const components: any[] = [{ type: "BODY", text: data.body }];
    if (data.footer) components.push({ type: "FOOTER", text: data.footer });
    const res = await s.graph(s.ENDPOINTS.createTemplate(data.waba_id), c.access_token, {
      method: "POST",
      body: { name: data.name, category: data.category, language: data.language, components },
    });
    if (!res.ok) return { ok: false as const, message: res.error };
    return { ok: true as const, id: String(res.data?.id ?? ""), status: String(res.data?.status ?? "PENDING") };
  });

/** Monitor de saúde: números da WABA + score local baseado nos erros 131048/131049. */
export const metaAssetHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ waba_id: z.string().trim().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = await svc();
    const c = await creds(context);
    const res = await s.graph(s.ENDPOINTS.phoneNumbers(data.waba_id), c.access_token);
    if (!res.ok) return { numbers: [] as any[], error: res.error };
    const numbers = (res.data?.data ?? []) as any[];

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const counts = new Map<string, { total: number; limited: number }>();
    for (const n of numbers) {
      const [{ count: total }, { count: limited }] = await Promise.all([
        context.supabase
          .from("message_logs")
          .select("id", { count: "exact", head: true })
          .eq("phone_number_id", n.id)
          .gte("created_at", since),
        context.supabase
          .from("message_logs")
          .select("id", { count: "exact", head: true })
          .eq("phone_number_id", n.id)
          .in("error_code", ["131048", "131049"])
          .gte("created_at", since),
      ]);
      counts.set(String(n.id), { total: total ?? 0, limited: limited ?? 0 });
    }

    return {
      error: "",
      numbers: numbers.map((n) => {
        const stat = counts.get(String(n.id)) ?? { total: 0, limited: 0 };
        const quality = String(n.quality_rating ?? "UNKNOWN").toUpperCase();
        const base = quality === "GREEN" ? 100 : quality === "YELLOW" ? 70 : quality === "RED" ? 40 : 60;
        const ratio = stat.total > 0 ? stat.limited / stat.total : 0;
        const score = Math.max(0, Math.round(base - ratio * 100));
        return {
          id: String(n.id),
          display_phone_number: n.display_phone_number ?? "—",
          verified_name: n.verified_name ?? "—",
          quality_rating: quality,
          code_verification_status: n.code_verification_status ?? "—",
          status: n.status ?? "—",
          messages_7d: stat.total,
          restricted_errors_7d: stat.limited,
          health_score: score,
        };
      }),
    };
  });
