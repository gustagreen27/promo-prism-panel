import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Verifica restrições de uma WABA (ou de todas) direto na Meta e grava no banco. */
export const checkWabaRestrictionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ waba_ref_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { checkWabaRestrictions } = await import("@/lib/meta/wa-restrictions.server");

    let q = context.supabase
      .from("whatsapp_wabas")
      .select("id,nome_interno,waba_id,business_id,access_token");
    if (data?.waba_ref_id) q = q.eq("id", data.waba_ref_id);
    const { data: wabas, error } = await q;
    if (error) throw error;

    const results = [] as any[];
    for (const w of wabas ?? []) {
      try {
        results.push(await checkWabaRestrictions(context.supabase, w));
      } catch (e: any) {
        results.push({
          waba_ref_id: w.id,
          waba_id: w.waba_id,
          nome_interno: w.nome_interno,
          business_id: w.business_id,
          level: "unknown",
          reason: e?.message ?? "Falha ao consultar a Meta",
          restrictions: [],
        });
      }
    }

    return {
      ok: true,
      checked: results.length,
      restricted: results.filter((r) => r.level === "restricted").length,
      limited: results.filter((r) => r.level === "limited").length,
      results,
    };
  });
