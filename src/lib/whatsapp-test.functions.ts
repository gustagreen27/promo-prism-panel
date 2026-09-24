import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaEgressFetch } from "@/lib/meta/meta-egress";
import { GRAPH_VERSION } from "@/lib/meta/graph-version";

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

export type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
  raw?: any;
};

export type WabaTemplate = {
  name: string;
  status: string;
  language: string;
  category: string;
  parameter_format?: "POSITIONAL" | "NAMED";
  components: Array<any>;
};

export type ListWabaTemplatesResult = {
  templates: WabaTemplate[];
  error?: CheckResult;
};

export type SendTestTemplateResult =
  | { ok: true; message_id: string | null; response: any }
  | { ok: false; error: string; hint?: string; raw?: any };

function explainMetaError(err: any): { detail: string; hint: string } {
  const code = err?.code;
  const sub = err?.error_subcode;
  const msg: string = err?.message ?? "Erro desconhecido";
  if (code === 190 || /access token/i.test(msg) || /Session has expired/i.test(msg)) {
    return {
      detail: msg,
      hint: "Access Token expirado ou inválido. Gere um novo em Meta for Developers → seu app → WhatsApp → API Setup. Para não expirar, use um System User Token (Business Settings → Users → System Users) com escopos whatsapp_business_messaging e whatsapp_business_management.",
    };
  }
  if (code === 10 || code === 200 || sub === 2018001) {
    return { detail: msg, hint: "O token não tem permissão suficiente. Verifique escopos whatsapp_business_messaging + whatsapp_business_management e se o System User tem acesso ao WABA." };
  }
  if (code === 100) {
    return { detail: msg, hint: "ID inválido (WABA ID ou Phone Number ID). Confirme os IDs no Business Manager." };
  }
  if (code === 803) {
    return { detail: msg, hint: "Objeto não encontrado. O ID informado não existe ou o token não tem acesso." };
  }
  return { detail: msg, hint: "Consulte a documentação da Meta para o código de erro retornado." };
}

async function metaGet(url: string, token: string) {
  const res = await metaEgressFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export const testWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const creds = (await loadCreds(context)) as any;
    const version = GRAPH_VERSION;
    const results: CheckResult[] = [];

    // 1) Credenciais presentes
    const missing: string[] = [];
    if (!creds.access_token) missing.push("Access Token");
    if (!creds.phone_number_id) missing.push("Phone Number ID");
    if (!creds.waba_id) missing.push("WABA ID");
    results.push({
      name: "Credenciais salvas",
      ok: missing.length === 0,
      detail: missing.length ? `Faltando: ${missing.join(", ")}` : "Todas as credenciais obrigatórias estão preenchidas.",
      hint: missing.length ? "Preencha e clique em Salvar credenciais." : undefined,
    });
    if (!creds.access_token) return { results };

    // 2) Token válido (/me ou /debug_token)
    {
      const r = await metaGet(`https://graph.facebook.com/${version}/me`, creds.access_token);
      if (r.ok) {
        results.push({ name: "Access Token válido", ok: true, detail: `Autenticado como: ${r.json?.name ?? r.json?.id ?? "OK"}` });
      } else {
        const ex = explainMetaError(r.json?.error);
        results.push({ name: "Access Token válido", ok: false, detail: ex.detail, hint: ex.hint, raw: r.json });
        return { results };
      }
    }

    // 3) WABA acessível
    if (creds.waba_id) {
      const r = await metaGet(
        `https://graph.facebook.com/${version}/${creds.waba_id}?fields=id,name,currency,timezone_id,message_template_namespace`,
        creds.access_token,
      );
      if (r.ok) {
        results.push({
          name: "WABA acessível",
          ok: true,
          detail: `WABA: ${r.json?.name ?? r.json?.id} · namespace: ${r.json?.message_template_namespace ?? "—"}`,
        });
      } else {
        const ex = explainMetaError(r.json?.error);
        results.push({ name: "WABA acessível", ok: false, detail: ex.detail, hint: ex.hint, raw: r.json });
      }
    }

    // 4) Phone Number acessível
    if (creds.phone_number_id) {
      const r = await metaGet(
        `https://graph.facebook.com/${version}/${creds.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
        creds.access_token,
      );
      if (r.ok) {
        results.push({
          name: "Phone Number acessível",
          ok: true,
          detail: `${r.json?.display_phone_number ?? r.json?.id} · ${r.json?.verified_name ?? ""} · qualidade: ${r.json?.quality_rating ?? "—"}`,
        });
      } else {
        const ex = explainMetaError(r.json?.error);
        results.push({ name: "Phone Number acessível", ok: false, detail: ex.detail, hint: ex.hint, raw: r.json });
      }
    }

    // 5) Templates (permissão whatsapp_business_management)
    if (creds.waba_id) {
      const r = await metaGet(
        `https://graph.facebook.com/${version}/${creds.waba_id}/message_templates?limit=1&fields=name,status`,
        creds.access_token,
      );
      if (r.ok) {
        const count = Array.isArray(r.json?.data) ? r.json.data.length : 0;
        results.push({
          name: "Permissão para listar templates",
          ok: true,
          detail: count ? `OK — encontrado ao menos ${count} template.` : "OK — nenhum template cadastrado ainda.",
        });
      } else {
        const ex = explainMetaError(r.json?.error);
        results.push({ name: "Permissão para listar templates", ok: false, detail: ex.detail, hint: ex.hint, raw: r.json });
      }
    }

    return { results };
  });

export const listWabaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const creds = await loadCreds(context);
    if (!creds.waba_id || !creds.access_token) {
      return {
        templates: [],
        error: {
          name: "Listar templates",
          ok: false,
          detail: "Cadastre WABA ID e Access Token em Configurações.",
          hint: "Preencha os campos acima e clique em Salvar credenciais.",
        },
      } satisfies ListWabaTemplatesResult;
    }
    const version = GRAPH_VERSION;
    const url = `https://graph.facebook.com/${version}/${creds.waba_id}/message_templates?limit=200&fields=name,status,language,category,components,parameter_format`;
    try {
      const res = await metaEgressFetch(url, {
        headers: { Authorization: `Bearer ${creds.access_token}` },
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const ex = explainMetaError(json?.error ?? { message: `HTTP ${res.status}` });
        return {
          templates: [],
          error: {
            name: "Listar templates",
            ok: false,
            detail: ex.detail,
            hint: ex.hint,
            raw: json,
          },
        } satisfies ListWabaTemplatesResult;
      }
      return { templates: (json?.data ?? []) as WabaTemplate[] } satisfies ListWabaTemplatesResult;
    } catch (e: any) {
      return {
        templates: [],
        error: {
          name: "Listar templates",
          ok: false,
          detail: e?.message ?? "Falha ao conectar com a API da Meta.",
          hint: "Verifique sua conexão e tente novamente. Se persistir, rode Testar conexão para ver cada etapa.",
        },
      } satisfies ListWabaTemplatesResult;
    }
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
        graph_api_version: z.string().trim().max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const creds = await loadCreds(context);
    if (!creds.phone_number_id || !creds.access_token) {
      return {
        ok: false,
        error: "Cadastre Phone Number ID e Access Token em Configurações.",
        hint: "Preencha os campos acima e clique em Salvar credenciais.",
      } satisfies SendTestTemplateResult;
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

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phone_number_id}/messages`;
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

    try {
      const res = await metaEgressFetch(url, {
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
        const ex = explainMetaError(json?.error ?? { message: `HTTP ${res.status}` });
        return { ok: false, error: ex.detail, hint: ex.hint, raw: json } satisfies SendTestTemplateResult;
      }
      return { ok: true, message_id: json?.messages?.[0]?.id ?? null, response: json } satisfies SendTestTemplateResult;
    } catch (e: any) {
      return {
        ok: false,
        error: e?.message ?? "Falha ao conectar com a API da Meta.",
        hint: "Verifique a conexão e tente novamente.",
      } satisfies SendTestTemplateResult;
    }
  });
