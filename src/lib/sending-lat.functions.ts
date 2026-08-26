import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SETTING_KEY = "sending_lat_api_key";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function loadKey(ctx: { supabase: any; userId: string }): Promise<string> {
  const { data } = await ctx.supabase
    .from("settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle();
  const key = (data?.value as any)?.api_key as string | undefined;
  if (!key) throw new Error("Chave de API da sending.lat não configurada.");
  return key;
}

export const getSendingLatKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    const key = (data?.value as any)?.api_key as string | undefined;
    return {
      configured: Boolean(key),
      masked: key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : null,
    };
  });

export const setSendingLatKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: existing } = await context.supabase
      .from("settings")
      .select("id")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    const value = { api_key: data.apiKey };
    if (existing) {
      const { error } = await context.supabase
        .from("settings")
        .update({ value })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("settings")
        .insert({ key: SETTING_KEY, value });
      if (error) throw error;
    }
    return { ok: true };
  });

export const sendingLatCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const key = await loadKey(context);
    const { checkCredits } = await import("@/lib/sending-lat.server");
    return await checkCredits(key);
  });

export const sendingLatReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        startDate: z.string().trim().optional(),
        endDate: z.string().trim().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const key = await loadKey(context);
    const { getReports } = await import("@/lib/sending-lat.server");
    return await getReports(key, data.startDate, data.endDate);
  });

export const sendingLatReportDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.union([z.string(), z.number()]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const key = await loadKey(context);
    const { getReportDetails, getMediaPaths } = await import("@/lib/sending-lat.server");
    const details = await getReportDetails(key, data.campaignId);
    const media = await getMediaPaths(key, data.campaignId).catch(() => null);
    return { details, media };
  });

export const sendingLatSendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nome_campanha: z.string().trim().min(1).max(160),
        mensagem: z.string().trim().min(1).max(4096),
        numeros_manuais: z.string().trim().optional(),
        base_contatos_id: z.string().trim().optional(),
        tipo_midia: z.enum(["imagem", "video", "nenhum"]).optional(),
        midia_url: z.string().trim().optional(),
        foto_perfil_url: z.string().trim().optional(),
        nome_perfil: z.string().trim().optional(),
        biografia: z.string().trim().optional(),
        nome_btn1: z.string().trim().optional(),
        link_btn1: z.string().trim().optional(),
        nome_btn2: z.string().trim().optional(),
        link_btn2: z.string().trim().optional(),
        nome_btn_rapida: z.string().trim().optional(),
        agendar_envio: z.union([z.literal(0), z.literal(1)]).optional(),
        data_agendamento: z.string().trim().optional(),
        hora_agendamento: z.string().trim().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.numeros_manuais && !data.base_contatos_id) {
      throw new Error("Informe números manuais ou o ID de uma base de contatos.");
    }
    const key = await loadKey(context);
    const { sendCampaign } = await import("@/lib/sending-lat.server");
    return await sendCampaign(key, data);
  });
