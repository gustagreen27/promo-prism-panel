import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function loadCreds(ctx: { supabase: any }) {
  const { data: row, error } = await ctx.supabase
    .from("settings")
    .select("value")
    .eq("key", "whatsapp_credentials")
    .maybeSingle();
  if (error) throw error;
  const creds = (row?.value ?? {}) as {
    phone_number_id?: string;
    waba_id?: string;
    access_token?: string;
  };
  return creds;
}

export const listWabaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const creds = await loadCreds(context);
    if (!creds.waba_id || !creds.access_token) {
      throw new Error("Cadastre WABA ID e Access Token em Configurações.");
    }
    const version = "v25.0";
    const url = `https://graph.facebook.com/${version}/${creds.waba_id}/message_templates?limit=200&fields=name,status,language,category,components,parameter_format`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.access_token}` },
    });
    const json: any = await res.json();
    if (!res.ok) {
      throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    }
    return (json?.data ?? []) as Array<{
      name: string;
      status: string;
      language: string;
      category: string;
      parameter_format?: "POSITIONAL" | "NAMED";
      components: Array<any>;
    }>;
  });

export const sendTestTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        to: z.string().trim().min(8).max(20),
        template_name: z.string().trim().min(1).max(120),
        language: z.string().trim().min(2).max(10).default("pt_BR"),
        params: z.array(z.string().max(500)).max(10).default([]),
        button_url_param: z.string().max(500).optional(),
        button_index: z.number().int().min(0).max(9).default(0),
        graph_api_version: z.string().trim().max(10).default("v25.0"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const creds = await loadCreds(context);
    if (!creds.phone_number_id || !creds.access_token) {
      throw new Error("Cadastre Phone Number ID e Access Token em Configurações.");
    }

    const components: any[] = [];
    if (data.params.length) {
      components.push({
        type: "body",
        parameters: data.params.map((text) => ({ type: "text", text })),
      });
    }
    if (data.button_url_param && data.button_url_param.trim()) {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(data.button_index),
        parameters: [{ type: "text", text: data.button_url_param.trim() }],
      });
    }

    const url = `https://graph.facebook.com/${data.graph_api_version}/${creds.phone_number_id}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: data.to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: data.template_name,
        language: { code: data.language },
        ...(components.length ? { components } : {}),
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
