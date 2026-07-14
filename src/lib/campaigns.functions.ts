import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "./slugify";

const statusEnum = z.enum(["draft", "active", "paused", "archived"]);
const openModeEnum = z.enum(["smart", "iframe", "redirect", "wrapper"]);

const optStr = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v))
    .optional();

const optUrl = (max = 2048) =>
  z
    .union([z.string().trim().url().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v))
    .optional();

const campaignFields = {
  category: optStr(80),
  campaign_type: optStr(80),
  link_intent: optStr(80),
  page_category: optStr(80),
  link_title: optStr(160),
  link_description: optStr(400),
  intermediate_text: optStr(2000),
  cta_label: optStr(80),
  preview_image_url: optUrl(),
  favicon_url: optUrl(),
  og_title: optStr(160),
  og_description: optStr(400),
  og_image_url: optUrl(),
  og_type: optStr(40),
  utm_source: optStr(80),
  utm_medium: optStr(80),
  utm_campaign: optStr(120),
  utm_term: optStr(120),
  utm_content: optStr(120),
  status: statusEnum.optional(),
  open_mode: openModeEnum.optional(),
  participants: z.array(z.enum(["gustavo", "cayo"])).optional().default([]),
};

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).optional(),
  destination_url: z.string().trim().url().max(2048),
  ...campaignFields,
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(80).optional(),
  destination_url: z.string().trim().url().max(2048).optional(),
  ...campaignFields,
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);

    const { data: campaigns, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = campaigns?.map((c) => c.id) ?? [];
    const counts: Record<string, { total: number; unique: number }> = {};
    if (ids.length) {
      const { data: clicks } = await supabaseAdmin
        .from("campaign_clicks")
        .select("campaign_id, ip")
        .in("campaign_id", ids);
      const seen: Record<string, Set<string>> = {};
      for (const row of clicks ?? []) {
        const k = row.campaign_id as string;
        counts[k] ||= { total: 0, unique: 0 };
        counts[k].total += 1;
        seen[k] ||= new Set();
        if (row.ip) seen[k].add(row.ip as string);
      }
      for (const k of Object.keys(seen)) counts[k].unique = seen[k].size;
    }

    return (campaigns ?? []).map((c) => ({
      ...c,
      total_clicks: counts[c.id]?.total ?? 0,
      unique_clicks: counts[c.id]?.unique ?? 0,
    }));
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const { data: c, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return c;
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);

    const userProvidedSlug = !!data.slug;
    const baseSlug = slugify(data.slug || data.name);
    if (!baseSlug) throw new Error("Slug inválido");

    let slug = baseSlug;
    if (userProvidedSlug) {
      const { data: existing } = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (existing) throw new Error(`Slug "${slug}" já está em uso`);
    } else {
      let i = 1;
      while (true) {
        const { data: existing } = await supabaseAdmin
          .from("campaigns")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!existing) break;
        i += 1;
        slug = `${baseSlug}-${i}`;
      }
    }

    const { slug: _ignored, ...rest } = data;
    const { data: created, error } = await supabaseAdmin
      .from("campaigns")
      .insert({
        ...rest,
        slug,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const checkSlugAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(80), excludeId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const normalized = slugify(data.slug);
    if (!normalized) return { available: false as const, normalized, reason: "invalid" as const };
    if (normalized !== data.slug) {
      return { available: false as const, normalized, reason: "format" as const };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("campaigns").select("id").eq("slug", normalized);
    if (data.excludeId) q = q.neq("id", data.excludeId);
    const { data: existing } = await q.maybeSingle();
    if (existing) return { available: false as const, normalized, reason: "taken" as const };
    return { available: true as const, normalized };
  });

const INTENT_INVALIDATING_FIELDS = [
  "destination_url",
  "link_title",
  "link_description",
  "og_title",
  "og_description",
  "og_image_url",
  "preview_image_url",
  "category",
  "campaign_type",
  "link_intent",
  "page_category",
  "intermediate_text",
  "cta_label",
] as const;

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const { id, slug: rawSlug, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (rawSlug !== undefined) {
      const newSlug = slugify(rawSlug);
      if (!newSlug) throw new Error("Slug inválido");
      const { data: existing } = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .eq("slug", newSlug)
        .neq("id", id)
        .maybeSingle();
      if (existing) throw new Error(`Slug "${newSlug}" já está em uso`);
      patch.slug = newSlug;
    }

    // Mark intent analysis as stale if any signal it depends on changed.
    const { data: current } = await supabaseAdmin
      .from("campaigns")
      .select("destination_url, link_title, link_description, og_title, og_description, og_image_url, preview_image_url, category, campaign_type, link_intent, page_category, intermediate_text, cta_label")
      .eq("id", id)
      .maybeSingle();
    if (current) {
      const changed = INTENT_INVALIDATING_FIELDS.some((f) => {
        if (!(f in patch)) return false;
        const next = patch[f];
        const prev = (current as Record<string, unknown>)[f];
        return (next ?? null) !== (prev ?? null);
      });
      if (changed) {
        patch.intent_score = null;
        patch.intent_report = null;
        patch.intent_checked_at = null;
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("campaigns")
      .update(patch as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // Re-checa iframe compat se a URL de destino mudou.
    if (
      current &&
      typeof patch.destination_url === "string" &&
      patch.destination_url !== (current as Record<string, unknown>).destination_url
    ) {
      try {
        const { canEmbedInIframe } = await import("./track.functions");
        const compat = await canEmbedInIframe(patch.destination_url);
        await supabaseAdmin
          .from("campaigns")
          .update({
            iframe_compatible: compat,
            iframe_checked_at: new Date().toISOString(),
          } as never)
          .eq("id", id);
      } catch {
        // best effort — não bloqueia o update
      }
    }

    return updated;
  });

export const recheckIframeCompatibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const { data: c, error } = await supabaseAdmin
      .from("campaigns")
      .select("id, destination_url")
      .eq("id", data.id)
      .single();
    if (error || !c) throw error ?? new Error("Campanha não encontrada");
    const { canEmbedInIframe } = await import("./track.functions");
    const compat = await canEmbedInIframe(c.destination_url);
    await supabaseAdmin
      .from("campaigns")
      .update({
        iframe_compatible: compat,
        iframe_checked_at: new Date().toISOString(),
      } as never)
      .eq("id", c.id);
    return { iframe_compatible: compat, iframe_checked_at: new Date().toISOString() };
  });

export const getCampaignAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);

    const { data: campaign, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (cErr) throw cErr;

    const { data: clicks, error: clErr } = await supabaseAdmin
      .from("campaign_clicks")
      .select("*")
      .eq("campaign_id", data.id)
      .order("clicked_at", { ascending: false })
      .limit(5000);
    if (clErr) throw clErr;

    return { campaign, clicks: clicks ?? [] };
  });

// ---------- Intent analysis ----------

const SENSITIVE_TERMS = [
  "senha", "cpf", "cartão", "cartao", "boleto urgente", "clique aqui urgente",
  "ganhou", "prêmio", "premio garantido", "pix urgente", "bloqueio", "suspensão",
  "última chance", "phishing", "golpe", "verifique sua conta", "atualize seus dados",
];

async function fetchDestination(url: string) {
  const result = {
    final_url: url,
    redirect_count: 0,
    https: false,
    status: 0 as number,
    ok: false,
    title: null as string | null,
    description: null as string | null,
    og_title: null as string | null,
    og_description: null as string | null,
    og_image: null as string | null,
    body_text: "" as string,
    error: null as string | null,
  };
  let current = url;
  try {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          result.status = res.status;
          break;
        }
        result.redirect_count += 1;
        current = new URL(loc, current).toString();
        continue;
      }
      result.status = res.status;
      result.ok = res.ok;
      result.final_url = current;
      result.https = current.startsWith("https://");
      const html = (await res.text()).slice(0, 200_000);
      const pick = (re: RegExp) => {
        const m = html.match(re);
        return m?.[1]?.trim() || null;
      };
      result.title = pick(/<title[^>]*>([^<]+)<\/title>/i);
      result.description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      result.og_title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      result.og_description = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
      result.og_image = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      result.body_text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 4000);
      break;
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

type IntentCheck = { name: string; status: "ok" | "warn" | "fail"; detail: string };
type IntentReport = { score: number; summary: string; checks: IntentCheck[] };

export const analyzeCampaignIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);

    const { data: c, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !c) throw error ?? new Error("Campanha não encontrada");

    const dest = await fetchDestination(c.destination_url);
    const checks: IntentCheck[] = [];

    // Heurísticas determinísticas
    checks.push({
      name: "Página carrega",
      status: dest.ok ? "ok" : dest.error ? "fail" : dest.status >= 400 ? "fail" : "warn",
      detail: dest.error
        ? `Erro de rede: ${dest.error}`
        : `HTTP ${dest.status} em ${dest.final_url}`,
    });
    checks.push({
      name: "HTTPS",
      status: dest.https ? "ok" : "fail",
      detail: dest.https ? "Conexão segura." : "Destino sem HTTPS.",
    });
    checks.push({
      name: "Redirecionamentos",
      status: dest.redirect_count <= 1 ? "ok" : dest.redirect_count <= 3 ? "warn" : "fail",
      detail: `${dest.redirect_count} redirecionamento(s) até a URL final.`,
    });

    const bodyForScan = `${c.name ?? ""} ${c.link_title ?? ""} ${c.link_description ?? ""} ${dest.title ?? ""} ${dest.description ?? ""} ${dest.body_text}`.toLowerCase();
    const hits = SENSITIVE_TERMS.filter((t) => bodyForScan.includes(t));
    checks.push({
      name: "Termos sensíveis",
      status: hits.length === 0 ? "ok" : hits.length <= 2 ? "warn" : "fail",
      detail: hits.length ? `Encontrados: ${hits.join(", ")}` : "Nenhum termo sensível detectado.",
    });

    let host = "";
    try { host = new URL(dest.final_url).hostname; } catch {}
    const suspiciousTld = /\.(zip|mov|country|click|link|gq|tk|ml|cf)$/.test(host);
    const looksIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
    checks.push({
      name: "Domínio",
      status: suspiciousTld || looksIp ? "warn" : "ok",
      detail: looksIp
        ? "URL aponta para um IP, não um domínio."
        : suspiciousTld
          ? `TLD pouco confiável: ${host}`
          : `Domínio: ${host || "—"}`,
    });

    // Análise por IA (qualitativa)
    let aiReport: { score: number; summary: string; checks: IntentCheck[] } | null = null;
    const key = process.env.LOVABLE_API_KEY;
    if (key) {
      try {
        const payload = {
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Você analisa coerência e segurança de campanhas de marketing. Responda APENAS em JSON válido no formato: {\"score\": number 0-100, \"summary\": string, \"checks\":[{\"name\":string,\"status\":\"ok\"|\"warn\"|\"fail\",\"detail\":string}]}. Avalie: 1) Título do link combina com nome/categoria da campanha; 2) Descrição combina com o conteúdo do destino; 3) Imagem de preview adequada (se houver); 4) Coerência com a categoria escolhida; 5) Sinais de risco para o usuário final. Seja conciso (até 3 frases por detail).",
            },
            {
              role: "user",
              content: JSON.stringify({
                campaign: {
                  name: c.name,
                  category: c.category,
                  link_title: c.link_title,
                  link_description: c.link_description,
                  preview_image_url: c.preview_image_url,
                  og_title: c.og_title,
                  og_description: c.og_description,
                  destination_url: c.destination_url,
                },
                destination: {
                  final_url: dest.final_url,
                  title: dest.title,
                  description: dest.description,
                  og_title: dest.og_title,
                  og_description: dest.og_description,
                  og_image: dest.og_image,
                  excerpt: dest.body_text.slice(0, 1500),
                },
              }),
            },
          ],
          response_format: { type: "json_object" },
        };
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "lovable-app",
          },
          body: JSON.stringify(payload),
        });
        if (aiRes.ok) {
          const j = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
          const txt = j.choices?.[0]?.message?.content ?? "";
          aiReport = JSON.parse(txt);
        } else if (aiRes.status === 429) {
          checks.push({ name: "Análise IA", status: "warn", detail: "Limite de requisições da IA atingido — tente novamente em instantes." });
        } else if (aiRes.status === 402) {
          checks.push({ name: "Análise IA", status: "warn", detail: "Créditos de IA esgotados no workspace." });
        } else {
          checks.push({ name: "Análise IA", status: "warn", detail: `IA indisponível (HTTP ${aiRes.status}).` });
        }
      } catch (e) {
        checks.push({
          name: "Análise IA",
          status: "warn",
          detail: `Falha ao consultar IA: ${e instanceof Error ? e.message : "erro desconhecido"}`,
        });
      }
    } else {
      checks.push({ name: "Análise IA", status: "warn", detail: "LOVABLE_API_KEY ausente." });
    }

    const aiChecks = aiReport?.checks ?? [];
    const allChecks = [...checks, ...aiChecks];

    // Score combinado: determinístico + IA
    const detScore = (() => {
      let s = 100;
      for (const ck of checks) {
        if (ck.status === "warn") s -= 8;
        if (ck.status === "fail") s -= 20;
      }
      return Math.max(0, s);
    })();
    const score = aiReport
      ? Math.round((detScore + Math.max(0, Math.min(100, aiReport.score))) / 2)
      : detScore;

    const report: IntentReport = {
      score,
      summary:
        aiReport?.summary ??
        (score >= 80
          ? "Configuração consistente."
          : score >= 50
            ? "Há pontos de atenção — revise antes de disparar."
            : "Riscos relevantes detectados."),
      checks: allChecks,
    };

    await supabaseAdmin
      .from("campaigns")
      .update({
        intent_score: report.score,
        intent_report: report as never,
        intent_checked_at: new Date().toISOString(),
        // Aproveita e preenche sugestões se o admin deixou vazio
        link_title: c.link_title ?? dest.title,
        link_description: c.link_description ?? dest.description,
        og_image_url: c.og_image_url ?? dest.og_image,
      } as never)
      .eq("id", c.id);

    return report;
  });

// ---------- WhatsApp dispatch links (admin) ----------

// Business rule: "Enviados" reflects delivered count (not raw sent),
// and progress percent is computed from delivered/total. Applied
// server-side so every consumer (admin + public report) sees the same
// numbers regardless of what the UI renders.
type WaDispatchRow = {
  id: string;
  name: string | null;
  status: string;
  scheduled_at: string | null;
  total_recipients: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  replied_count: number | null;
  failed_count: number | null;
  progress: Record<string, number> | null;
};

function normalizeDispatch<T extends WaDispatchRow>(r: T): T {

  const total = Number(r.total_recipients ?? 0);
  const delivered = Number(r.delivered_count ?? 0);
  const failed = Number(r.failed_count ?? 0);
  // Enviados == Entregues
  const sent = delivered;
  const percent = total > 0 ? Math.min(100, Math.round(((delivered + failed) / total) * 100)) : 0;
  const progress = {
    ...(r.progress ?? {}),
    total,
    sent,
    delivered,
    failed,
    percent,
  };
  return { ...r, sent_count: sent, progress } as T;
}

export const listWaCampaignsForLinking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const { data: rows, error } = await supabaseAdmin
      .from("wa_campaigns")
      .select("id, name, status, scheduled_at, created_at, linked_campaign_id, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, progress")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      ...normalizeDispatch(r as unknown as WaDispatchRow),
      linked_campaign_id: r.linked_campaign_id as string | null,
      is_linked: r.linked_campaign_id === data.campaignId,
    }));

  });

export const setWaCampaignLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      waCampaignId: z.string().uuid(),
      campaignId: z.string().uuid().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const { error } = await supabaseAdmin
      .from("wa_campaigns")
      .update({ linked_campaign_id: data.campaignId } as never)
      .eq("id", data.waCampaignId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Public (unauthenticated) report ----------
// Returns only safe, non-sensitive campaign metrics for a shareable link.
export const getPublicCampaignReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: c, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select(
        "id, name, slug, category, status, intent_score, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!c) throw new Error("NOT_FOUND");

    const { data: clicks, error: clErr } = await supabaseAdmin
      .from("campaign_clicks")
      .select("id, country, region, city, device_type, os, browser, clicked_at, referer")
      .eq("campaign_id", data.id)
      .order("clicked_at", { ascending: false })
      .limit(5000);
    if (clErr) throw clErr;

    const { data: dispatches, error: dErr } = await supabaseAdmin
      .from("wa_campaigns")
      .select("id, name, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, progress")
      .eq("linked_campaign_id", data.id)
      .order("created_at", { ascending: false });
    if (dErr) throw dErr;

    const normalizedDispatches = (dispatches ?? []).map((r) =>
      normalizeDispatch(r as unknown as WaDispatchRow),
    );

    return { campaign: c, clicks: clicks ?? [], dispatches: normalizedDispatches };
  });

