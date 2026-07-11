import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito ao administrador");
}

/** Lista TODOS os números WhatsApp ativos (uso administrativo — ignora grants). */
export const adminListAllNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).passthrough().parse(d ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("whatsapp_connections")
      .select("id, display_name, nome_interno, name, display_phone, phone, status, quality_rating, daily_cap, paused_at, visibility")
      .is("paused_at", null)
      .not("status", "in", '("inactive")')
      .order("display_name", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []).map((c: any) => ({
      id: c.id,
      display_name: c.display_name ?? c.nome_interno ?? c.name ?? "—",
      phone_masked: String(c.display_phone ?? c.phone ?? "").replace(/(\d{2,4})$/, "****"),
      status: c.status,
      quality_rating: c.quality_rating ?? null,
      messaging_limit_tier: null,
      daily_cap: c.daily_cap ?? null,
    }));
    return { numbers: rows };
  });

/** Lista TODOS os templates aprovados (uso administrativo — ignora grants). */
export const adminListAllTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connection_id?: string | null }) =>
    z.object({ connection_id: z.string().uuid().nullish() }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    let q = supabase.from("whatsapp_templates").select("*");
    if (data.connection_id) q = q.eq("connection_id", data.connection_id);
    const { data: rows, error } = await q.order("name", { ascending: true });
    if (error) throw error;
    return { templates: rows ?? [] };
  });
