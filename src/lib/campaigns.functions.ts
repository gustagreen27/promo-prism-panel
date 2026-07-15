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

export const recalculateLinkedDispatchMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);

    const { data: dispatches, error } = await supabaseAdmin
      .from("wa_campaigns")
      .select("id, name, workspace_id, total_recipients, sent_count, delivered_count, failed_count, read_count, replied_count, progress")
      .eq("linked_campaign_id", data.campaignId);
    if (error) throw error;

    // Frente 2: usar RPC wa_recalc_campaign_progress e reler a linha,
    // em vez de 17 count(*) por dispatch (17M linhas escaneadas em 1 campanha de 1M).
    const updated: WaDispatchRow[] = [];
    for (const dispatch of dispatches ?? []) {
      const id = dispatch.id as string;
      const { error: recalcError } = await supabaseAdmin.rpc(
        "wa_recalc_campaign_progress" as never,
        { _campaign_id: id } as never,
      );
      if (recalcError) throw recalcError;

      const { data: saved, error: readError } = await supabaseAdmin
        .from("wa_campaigns")
        .select("id, name, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, progress, workspace_id")
        .eq("id", id)
        .single();
      if (readError) throw readError;

      const prog = (saved?.progress as Record<string, number> | null) ?? {};
      await supabaseAdmin.from("campaign_timeline").insert({
        campaign_id: id,
        workspace_id: (saved as any)?.workspace_id ?? dispatch.workspace_id,
        actor_id: context.userId,
        event_type: "metrics_recalculated",
        message: "Métricas recalculadas manualmente",
        payload: {
          linked_campaign_id: data.campaignId,
          sent_count: saved?.sent_count ?? 0,
          delivered_count: saved?.delivered_count ?? 0,
          failed_count: saved?.failed_count ?? 0,
          total_recipients: saved?.total_recipients ?? 0,
          progress_percent: prog.percent ?? 0,
        },
      } as never);

      updated.push(normalizeDispatch(saved as unknown as WaDispatchRow));
    }

    return { ok: true, updated };
  });

export const getCampaignDispatchAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);

    const { data: dispatches, error } = await supabaseAdmin
      .from("wa_campaigns")
      .select("id, name, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, progress, created_at, updated_at")
      .eq("linked_campaign_id", data.campaignId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (dispatches ?? []).map((d) => d.id as string);
    if (ids.length === 0) {
      return { dispatches: [], recipientSummaries: [], messageLogs: [], attempts: [], webhookLogs: [], timeline: [] };
    }

    // Frente 2: derivar de wa_campaigns.progress (mantido pelo trigger) —
    // 11 count(*) por dispatch em 1M linhas fazia a auditoria estourar timeout.
    const recipientSummaries = (dispatches ?? []).map((d: any) => {
      const p = (d.progress as Record<string, number> | null) ?? {};
      const total = Number(d.total_recipients ?? p.total ?? 0);
      const sent = Number(d.sent_count ?? p.sent ?? 0);
      const delivered = Number(d.delivered_count ?? p.delivered ?? 0);
      const read = Number(d.read_count ?? p.read ?? 0);
      const replied = Number(d.replied_count ?? p.replied ?? 0);
      const failed = Number(d.failed_count ?? p.failed ?? 0);
      return {
        campaign_id: d.id as string,
        total,
        pending: Number(p.pending ?? 0),
        accepted: Number(p.accepted ?? 0),
        sent,
        delivered,
        read,
        replied,
        failed,
        // Aproximações (derivadas de status; equivalência boa o bastante para a auditoria).
        with_meta_message_id: sent,
        with_sent_at: sent,
        with_delivered_at: delivered,
        with_failed_at: failed,
      };
    });

    const { data: messageLogs, error: logsError } = await supabaseAdmin
      .from("message_logs")
      .select("id, campaign_id, recipient_id, meta_message_id, message_status, http_status, failed_reason, error_code, created_at, updated_at")
      .in("campaign_id", ids)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (logsError) throw logsError;

    const { data: attempts, error: attemptsError } = await supabaseAdmin
      .from("wa_campaign_attempts")
      .select("id, campaign_id, recipient_id, meta_message_id, message_status, http_status, error_code, error_details, attempted_at")
      .in("campaign_id", ids)
      .order("attempted_at", { ascending: false })
      .limit(100);
    if (attemptsError) throw attemptsError;

    const webhookLogs = [] as any[];
    for (const id of ids) {
      const { data: rows, error: webhookError } = await supabaseAdmin
        .from("whatsapp_webhook_logs")
        .select("id, event_type, payload, processed, error, created_at")
        .contains("payload", { campaign_id: id })
        .order("created_at", { ascending: false })
        .limit(100);
      if (webhookError) throw webhookError;
      webhookLogs.push(...(rows ?? []));
    }
    webhookLogs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    const { data: timeline, error: timelineError } = await supabaseAdmin
      .from("campaign_timeline")
      .select("id, campaign_id, event_type, message, payload, created_at")
      .in("campaign_id", ids)
      .order("created_at", { ascending: false })
      .limit(100);
    if (timelineError) throw timelineError;

    return {
      dispatches: (dispatches ?? []).map((d) => normalizeDispatch(d as unknown as WaDispatchRow)),
      recipientSummaries,
      messageLogs: messageLogs ?? [],
      attempts: attempts ?? [],
      webhookLogs: webhookLogs.slice(0, 100),
      timeline: timeline ?? [],
    };
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
  const rawSent = Number(r.sent_count ?? 0);
  const rawDelivered = Number(r.delivered_count ?? 0);
  const failed = Number(r.failed_count ?? 0);
  // Regra: Enviados = Entregues. Quando webhooks de entrega não retornam
  // (delivered=0 em campanha concluída), usa o maior valor conhecido para
  // que ambos reflitam o real disparado.
  const unified = Math.max(rawSent, rawDelivered);
  const sent = unified;
  const delivered = unified;
  const processed = Math.min(total, unified + failed);
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const progress = {
    ...(r.progress ?? {}),
    total,
    sent,
    delivered,
    failed,
    processed,
    percent,
  };
  return { ...r, sent_count: sent, delivered_count: delivered, progress } as T;
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
// ============================================================================
// Public overrides — valores personalizados exibidos APENAS na página pública.
// Não afetam métricas reais, disparos, fila ou destinatários.
// ============================================================================

const breakdownRow = z.object({
  label: z.string().trim().min(1).max(80),
  count: z.number().int().min(0).max(1_000_000_000),
});

const simUnitEnum = z.enum(["s", "m", "h"]);
const simStatusKeyEnum = z.enum([
  "scheduled", "preparing", "running", "processing", "paused",
  "resuming", "finishing", "completed", "cancelled",
]);

const simulationSchema = z.object({
  mode: z.enum(["real", "custom", "real_plus"]).default("real"),
  refetch_interval_sec: z.number().int().min(3).max(120).default(5),
  start_at: z.string().datetime().nullable().optional(),
  duration_minutes: z.number().int().min(1).max(60 * 24 * 30).nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  total_contacts: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  initial_percent: z.number().min(0).max(100).default(0),
  max_percent: z.number().min(0).max(100).default(100),
  send_rate: z.object({ value: z.number().min(0), unit: simUnitEnum }).nullable().optional(),
  delivered: z.union([
    z.object({ mode: z.literal("rate"), value: z.number().min(0), unit: simUnitEnum }),
    z.object({ mode: z.literal("percent"), value: z.number().min(0).max(100) }),
  ]).nullable().optional(),
  failed: z.union([
    z.object({ mode: z.literal("rate"), value: z.number().min(0), unit: simUnitEnum }),
    z.object({ mode: z.literal("percent"), value: z.number().min(0).max(100) }),
  ]).nullable().optional(),
  clicks: z.object({
    per_interval: z.number().min(0),
    interval_sec: z.number().min(1),
  }).nullable().optional(),
  growth: z.object({
    kind: z.enum(["linear", "random", "stepped", "real_multiplier", "on_reload", "realtime"]),
    random_min: z.number().min(0).max(10).nullable().optional(),
    random_max: z.number().min(0).max(10).nullable().optional(),
    steps: z.array(z.object({ t_sec: z.number().min(0), sent: z.number().min(0) })).max(50).nullable().optional(),
    multiplier: z.number().min(0).max(1000).nullable().optional(),
  }),
  pauses: z.array(z.object({
    after_sent: z.number().int().min(0),
    duration_sec: z.number().int().min(1).max(60 * 60 * 24),
    status_label: z.string().trim().max(80).nullable().optional(),
    recalc_eta: z.boolean().default(false),
  })).max(50).default([]),
  status: z.object({
    override: z.union([simStatusKeyEnum, z.null()]).optional(),
    labels: z.record(simStatusKeyEnum, z.string().trim().max(80)).default({}),
  }).default({ override: null, labels: {} }),
  complete_at: z.string().datetime().nullable().optional(),
  runtime: z.object({
    active: z.boolean().default(false),
    sim_started_at: z.string().datetime().nullable().optional(),
    sim_paused_at: z.string().datetime().nullable().optional(),
    accumulated_pause_ms: z.number().int().min(0).default(0),
  }).default({ active: false, sim_started_at: null, sim_paused_at: null, accumulated_pause_ms: 0 }),
  updated_at: z.string().datetime().nullable().optional(),
  updated_by: z.string().uuid().nullable().optional(),
});

const publicOverridesSchema = z.object({
  total_clicks: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  sent: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  delivered: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  failed: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  countries: z.array(breakdownRow).max(50).nullable().optional(),
  cities: z.array(breakdownRow).max(50).nullable().optional(),
  devices: z.array(breakdownRow).max(50).nullable().optional(),
  simulation: simulationSchema.nullable().optional(),
});

export type PublicOverrides = z.infer<typeof publicOverridesSchema>;

function sanitizeOverrides(input: PublicOverrides): PublicOverrides {
  const out: PublicOverrides = {};
  if (input.total_clicks != null) out.total_clicks = input.total_clicks;
  if (input.sent != null) out.sent = input.sent;
  if (input.delivered != null) out.delivered = input.delivered;
  if (input.failed != null) out.failed = input.failed;
  const cleanList = (rows?: { label: string; count: number }[] | null) =>
    rows && rows.length > 0
      ? rows
          .filter((r) => r.label.trim().length > 0)
          .map((r) => ({ label: r.label.trim(), count: r.count }))
      : undefined;
  const co = cleanList(input.countries ?? undefined);
  const ci = cleanList(input.cities ?? undefined);
  const de = cleanList(input.devices ?? undefined);
  if (co) out.countries = co;
  if (ci) out.cities = ci;
  if (de) out.devices = de;
  if (input.simulation) out.simulation = input.simulation;
  return out;
}


export const getCampaignPublicOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const { data: row, error } = await supabaseAdmin
      .from("campaigns")
      .select("id, name, public_overrides")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return {
      id: row.id as string,
      name: row.name as string,
      overrides: ((row as { public_overrides: unknown }).public_overrides ?? {}) as PublicOverrides,
    };
  });

export const updateCampaignPublicOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), overrides: publicOverridesSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);
    const clean = sanitizeOverrides(data.overrides);
    if (clean.simulation) {
      clean.simulation.updated_at = new Date().toISOString();
      clean.simulation.updated_by = context.userId;
    }
    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ public_overrides: clean } as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true, overrides: clean };
  });

// Controle da simulação — apenas mexe em public_overrides.simulation.runtime.
// NUNCA altera worker, fila, wa_campaigns, campaign_recipients ou webhooks.
export const controlCampaignSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["start", "pause", "resume", "restart", "sync_real", "disable"]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context);

    if (data.action === "disable") {
      const { error } = await supabaseAdmin
        .from("campaigns")
        .update({ public_overrides: {} } as never)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true };
    }

    const { data: row, error: readErr } = await supabaseAdmin
      .from("campaigns")
      .select("public_overrides")
      .eq("id", data.id)
      .single();
    if (readErr) throw readErr;

    const current = ((row as { public_overrides: Record<string, unknown> }).public_overrides ?? {}) as PublicOverrides;
    const sim = (current.simulation ?? {}) as NonNullable<PublicOverrides["simulation"]>;
    const runtime = { ...(sim.runtime ?? { active: false, sim_started_at: null, sim_paused_at: null, accumulated_pause_ms: 0 }) };
    const nowIso = new Date().toISOString();

    if (data.action === "start") {
      runtime.active = true;
      runtime.sim_started_at = nowIso;
      runtime.sim_paused_at = null;
      runtime.accumulated_pause_ms = 0;
    } else if (data.action === "restart") {
      runtime.active = true;
      runtime.sim_started_at = nowIso;
      runtime.sim_paused_at = null;
      runtime.accumulated_pause_ms = 0;
    } else if (data.action === "pause") {
      if (runtime.active && !runtime.sim_paused_at) runtime.sim_paused_at = nowIso;
    } else if (data.action === "resume") {
      if (runtime.sim_paused_at) {
        const pausedFor = Math.max(0, Date.now() - new Date(runtime.sim_paused_at).getTime());
        runtime.accumulated_pause_ms = (runtime.accumulated_pause_ms ?? 0) + pausedFor;
        runtime.sim_paused_at = null;
        runtime.active = true;
      }
    } else if (data.action === "sync_real") {
      // Copia números reais para os overrides fixos, sem tocar em nada operacional.
      const { data: disp } = await supabaseAdmin
        .from("wa_campaigns")
        .select("total_recipients, sent_count, delivered_count, failed_count")
        .eq("linked_campaign_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const first = disp?.[0];
      if (first) {
        current.sent = (first.sent_count as number | null) ?? undefined;
        current.delivered = (first.delivered_count as number | null) ?? undefined;
        current.failed = (first.failed_count as number | null) ?? undefined;
        if (!sim.total_contacts) {
          (current.simulation ??= { ...sim }).total_contacts = (first.total_recipients as number | null) ?? undefined;
        }
      }
    }

    const nextSim: NonNullable<PublicOverrides["simulation"]> = {
      ...(current.simulation ?? sim),
      runtime,
      updated_at: nowIso,
      updated_by: context.userId,
    };
    const next: PublicOverrides = { ...current, simulation: nextSim };

    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ public_overrides: next } as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true, overrides: next };
  });


export const getPublicCampaignReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: c, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select(
        "id, name, slug, category, status, intent_score, created_at, updated_at, public_overrides",
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
      .limit(500);
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

    const dispatchIds = normalizedDispatches.map((d) => d.id as string);
    type PublicRecipient = { phone: string; status: string | null; sent_at: string | null; delivered_at: string | null };
    const recipientsByDispatch: Record<string, PublicRecipient[]> = {};
    if (dispatchIds.length > 0) {
      const maskPhone = (raw: string | null | undefined): string => {
        const digits = String(raw ?? "").replace(/\D/g, "");
        if (digits.length < 6) return raw ?? "—";
        const head = digits.slice(0, digits.length - 6);
        const tail = digits.slice(-2);
        return `+${head} ****${tail}`;
      };
      const PER_DISPATCH = 100;
      await Promise.all(
        dispatchIds.map(async (cid) => {
          const { data: recs, error: rErr } = await supabaseAdmin
            .from("campaign_recipients")
            .select("phone, status, sent_at, delivered_at")
            .eq("campaign_id", cid)
            .order("sent_at", { ascending: false, nullsFirst: false })
            .limit(PER_DISPATCH);
          if (rErr) throw rErr;
          recipientsByDispatch[cid] = (recs ?? []).map((r) => ({
            phone: maskPhone(r.phone as string),
            status: (r.status as string | null) ?? null,
            sent_at: (r.sent_at as string | null) ?? null,
            delivered_at: (r.delivered_at as string | null) ?? null,
          }));
        }),
      );
    }

    const { public_overrides, ...campaign } = c as typeof c & { public_overrides: unknown };
    const overrides = (public_overrides ?? {}) as PublicOverrides;

    return {
      campaign,
      clicks: clicks ?? [],
      dispatches: normalizedDispatches,
      recipientsByDispatch,
      overrides,
      server_now: new Date().toISOString(),
    };
  });





