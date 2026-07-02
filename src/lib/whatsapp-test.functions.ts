import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const sendTestTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        to: z.string().trim().min(8).max(20),
        template_name: z.string().trim().min(1).max(120).default("frgc_01"),
        language: z.string().trim().min(2).max(10).default("pt_BR"),
        params: z.array(z.string().max(500)).max(10).default([]),
        graph_api_version: z.string().trim().max(10).default("v25.0"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("settings")
      .select("value")
      .eq("key", "whatsapp_credentials")
      .maybeSingle();
    if (error) throw error;
    const creds = (row?.value ?? {}) as {
      phone_number_id?: string;
      access_token?: string;
    };
    if (!creds.phone_number_id || !creds.access_token) {
      throw new Error("Cadastre Phone Number ID e Access Token em Configurações.");
    }

    const url = `https://graph.facebook.com/${data.graph_api_version}/${creds.phone_number_id}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: data.to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: data.template_name,
        language: { code: data.language },
        ...(data.params.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: data.params.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return { ok: true, message_id: json?.messages?.[0]?.id ?? null, response: json };
  });
