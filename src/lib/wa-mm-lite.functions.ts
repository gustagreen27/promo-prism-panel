/**
 * Server functions da API de Mensagens de Marketing (MM Lite).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Consulta na Meta a elegibilidade/integração de MM Lite (uma WABA ou todas). */
export const checkMmLiteStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ waba_ref_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { checkMmLiteStatus } = await import("@/lib/meta/mm-lite.server");

    let q = context.supabase
      .from("whatsapp_wabas")
      .select("id,nome_interno,waba_id,business_id,access_token,mm_lite_enabled");
    if (data?.waba_ref_id) q = q.eq("id", data.waba_ref_id);
    const { data: wabas, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    for (const w of wabas ?? []) {
      try {
        results.push(await checkMmLiteStatus(context.supabase, w));
      } catch (e: any) {
        results.push({
          waba_ref_id: w.id,
          waba_id: w.waba_id,
          nome_interno: w.nome_interno,
          status: "UNKNOWN",
          tos_status: null,
          reason: e?.message ?? "Falha ao consultar a Meta",
          enabled: false,
        });
      }
    }

    return {
      ok: true,
      checked: results.length,
      onboarded: results.filter((r) => r.status === "ONBOARDED").length,
      eligible: results.filter((r) => r.status === "ELIGIBLE").length,
      results,
    };
  });

/** Liga/desliga o uso da MM Lite nos disparos de marketing desta WABA. */
export const setMmLiteEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        waba_ref_id: z.string().uuid(),
        enabled: z.boolean(),
        activity_sharing: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: waba, error } = await context.supabase
      .from("whatsapp_wabas")
      .select("id,mm_lite_status")
      .eq("id", data.waba_ref_id)
      .single();
    if (error) throw error;
    if (data.enabled && String(waba?.mm_lite_status ?? "") !== "ONBOARDED") {
      return {
        ok: false as const,
        message:
          "Esta WABA ainda não está integrada à API de Mensagens de Marketing. Aceite os Termos no Gerenciador do WhatsApp e verifique o status novamente.",
      };
    }
    const patch: Record<string, any> = { mm_lite_enabled: data.enabled };
    if (typeof data.activity_sharing === "boolean") patch.mm_lite_activity_sharing = data.activity_sharing;
    const { error: upErr } = await context.supabase
      .from("whatsapp_wabas")
      .update(patch)
      .eq("id", data.waba_ref_id);
    if (upErr) throw upErr;
    return { ok: true as const, message: data.enabled ? "MM Lite ativada." : "MM Lite desativada." };
  });
