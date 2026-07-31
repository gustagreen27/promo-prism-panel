import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getCountryCallingCode } from "@/lib/phone-country";

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
    // Admin: mostra TODOS os números cadastrados (independente de status de verificação
    // ou sync). O admin precisa conseguir enviar/testar por qualquer conexão existente.
    const { data, error } = await supabase
      .from("whatsapp_connections")
      .select("id, display_name, nome_interno, name, display_phone, phone, phone_number_id, waba_id, status, quality_rating, daily_cap, paused_at, visibility, code_verification_status, meta_sync_status")
      .order("display_name", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []).map((c: any) => ({
      id: c.id,
      display_name: c.display_name ?? c.nome_interno ?? c.name ?? "—",
      phone_masked: String(c.display_phone ?? c.phone ?? "").replace(/(\d{2,4})$/, "****"),
      phone_display: c.display_phone ?? c.phone ?? null,
      phone_number_id: c.phone_number_id ?? null,
      waba_id: c.waba_id ?? null,
      phone_country_code: getCountryCallingCode(c.phone ?? c.display_phone),
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
    z.object({ connection_id: z.string().uuid().nullish() }).passthrough().parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    let q = supabase.from("whatsapp_templates").select("*");
    if (data.connection_id) {
      // Templates são sincronizados por WABA (ficam vinculados só à 1ª conexão dela).
      // Portanto filtramos pela WABA da conexão, com fallback para a própria conexão.
      const { data: conn } = await supabase
        .from("whatsapp_connections")
        .select("waba_ref_id")
        .eq("id", data.connection_id)
        .maybeSingle();
      if (conn?.waba_ref_id) {
        q = q.or(`waba_ref_id.eq.${conn.waba_ref_id},connection_id.eq.${data.connection_id}`);
      } else {
        q = q.eq("connection_id", data.connection_id);
      }
    }
    const { data: rows, error } = await q.order("name", { ascending: true });

    if (error) throw error;
    return { templates: rows ?? [] };
  });
