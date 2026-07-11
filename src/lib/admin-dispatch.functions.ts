import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getCountryCallingCode } from "@/lib/phone-country";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito ao administrador");
}

/** Lista TODOS os números WhatsApp ativos (uso administrativo — ignora grants).
 *  Se `workspace_id` for informado, restringe a esse workspace. */
export const adminListAllNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspace_id: z.string().uuid().nullish() }).passthrough().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    let q = supabase
      .from("whatsapp_connections")
      .select(
        "id, display_name, nome_interno, name, display_phone, phone, status, quality_rating, daily_cap, paused_at, visibility, workspace_id, waba_ref_id",
      )
      .is("paused_at", null)
      .not("status", "in", '("inactive")')
      .order("display_name", { ascending: true });

    if (data.workspace_id) {
      // Validação: garante que o workspace existe antes de filtrar.
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces").select("id").eq("id", data.workspace_id).maybeSingle();
      if (wsErr) throw wsErr;
      if (!ws) throw new Error(`workspace_id inválido: ${data.workspace_id}`);
      q = q.eq("workspace_id", data.workspace_id);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    const numbers = (rows ?? []).map((c: any) => ({
      id: c.id,
      display_name: c.display_name ?? c.nome_interno ?? c.name ?? "—",
      phone_masked: String(c.display_phone ?? c.phone ?? "").replace(/(\d{2,4})$/, "****"),
      phone_display: c.display_phone ?? c.phone ?? null,
      phone_country_code: getCountryCallingCode(c.phone ?? c.display_phone),
      status: c.status,
      quality_rating: c.quality_rating ?? null,
      messaging_limit_tier: null,
      daily_cap: c.daily_cap ?? null,
      workspace_id: c.workspace_id ?? null,
      waba_ref_id: c.waba_ref_id ?? null,
    }));
    return { numbers };
  });

/** Lista TODOS os templates aprovados para o `connection_id` selecionado.
 *  Pagina em blocos para superar o teto default de 1000 linhas do PostgREST. */
export const adminListAllTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connection_id?: string | null; status?: string | null }) =>
    z.object({
      connection_id: z.string().uuid().nullish(),
      status: z.string().nullish(),
    }).passthrough().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    // Se veio connection_id, valida existência e resolve waba_ref_id para
    // também trazer templates ligados à mesma WABA (templates são por WABA).
    let wabaRefId: string | null = null;
    if (data.connection_id) {
      const { data: conn, error: connErr } = await supabase
        .from("whatsapp_connections")
        .select("id, waba_ref_id")
        .eq("id", data.connection_id)
        .maybeSingle();
      if (connErr) throw connErr;
      if (!conn) throw new Error(`connection_id inválido: ${data.connection_id}`);
      wabaRefId = conn.waba_ref_id ?? null;
    }

    const PAGE = 1000;
    const collected: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from("whatsapp_templates")
        .select("*")
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);

      if (data.connection_id && wabaRefId) {
        q = q.or(`connection_id.eq.${data.connection_id},waba_ref_id.eq.${wabaRefId}`);
      } else if (data.connection_id) {
        q = q.eq("connection_id", data.connection_id);
      }
      if (data.status) q = q.eq("status", data.status);

      const { data: rows, error } = await q;
      if (error) throw error;
      const batch = rows ?? [];
      collected.push(...batch);
      if (batch.length < PAGE) break;
    }

    // Dedup por id (o OR pode trazer duplicatas quando connection_id e waba_ref_id casam).
    const seen = new Set<string>();
    const templates = collected.filter((t: any) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    return { templates };
  });

