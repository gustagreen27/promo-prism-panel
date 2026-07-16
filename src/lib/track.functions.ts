import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { UAParser } from "ua-parser-js";

const inputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

const EVENT_TYPES = [
  "page_view",
  "iframe_loaded",
  "iframe_blocked",
  "redirect_started",
  "redirect_completed",
  "cta_clicked",
  "utm_detected",
  "duplicate_click",
  "returning_visitor",
  "bot_detected",
] as const;
type EventType = (typeof EVENT_TYPES)[number];

const eventInputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  event_type: z.enum(EVENT_TYPES),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const BOT_RE = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegrambot|slackbot|discordbot|preview|fetch|monitor|pingdom|uptimerobot|headless/i;

function pickIp(): string | null {
  const xff = getRequestHeader("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = getRequestHeader("x-real-ip");
  if (real) return real.trim();
  return getRequestIP() ?? null;
}

async function lookupIp(ip: string) {
  const key = process.env.IP_API_KEY;
  const proFields =
    "status,message,continent,continentCode,country,countryCode,countryCode3,region,regionName,city,district,zip,lat,lon,timezone,offset,currentTime,currency,callingCode,isp,org,as,asname,reverse,mobile,proxy,hosting,query";
  const freeFields =
    "status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting";
  const url = key
    ? `https://pro.ip-api.com/json/${encodeURIComponent(ip)}?fields=${proFields}&key=${key}`
    : `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${freeFields}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (j.status !== "success") return null;
    return j;
  } catch {
    return null;
  }
}

function mapGeoToRow(geo: Record<string, unknown> | null) {
  if (!geo) return {};
  const asRaw = (geo.as as string) ?? null;
  const asNumber = asRaw ? (asRaw.match(/AS(\d+)/)?.[1] ?? null) : null;
  return {
    continent: (geo.continent as string) ?? null,
    continent_code: (geo.continentCode as string) ?? null,
    country: (geo.country as string) ?? null,
    country_code: (geo.countryCode as string) ?? null,
    country_code3: (geo.countryCode3 as string) ?? null,
    region_code: (geo.region as string) ?? null,
    region: (geo.regionName as string) ?? null,
    city: (geo.city as string) ?? null,
    district: (geo.district as string) ?? null,
    zip: (geo.zip as string) ?? null,
    lat: (geo.lat as number) ?? null,
    lon: (geo.lon as number) ?? null,
    timezone: (geo.timezone as string) ?? null,
    utc_offset: typeof geo.offset === "number" ? (geo.offset as number) : null,
    currency: (geo.currency as string) ?? null,
    calling_code: (geo.callingCode as string) ?? null,
    isp: (geo.isp as string) ?? null,
    org: (geo.org as string) ?? null,
    as_name: (geo.asname as string) ?? (asRaw ?? null),
    as_number: asNumber,
    reverse_dns: (geo.reverse as string) ?? null,
    mobile: typeof geo.mobile === "boolean" ? (geo.mobile as boolean) : null,
    proxy: typeof geo.proxy === "boolean" ? (geo.proxy as boolean) : null,
    hosting: typeof geo.hosting === "boolean" ? (geo.hosting as boolean) : null,
  };
}

// Domínios conhecidos por recusarem iframe (X-Frame-Options/CSP).
// Evita o overhead do HEAD e garante o redirect imediato.
const KNOWN_NO_IFRAME = [
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "google.com", "www.google.com", "accounts.google.com",
  "facebook.com", "www.facebook.com", "m.facebook.com",
  "instagram.com", "www.instagram.com",
  "x.com", "twitter.com", "www.twitter.com",
  "linkedin.com", "www.linkedin.com",
  "tiktok.com", "www.tiktok.com",
  "github.com", "www.github.com",
];

export async function canEmbedInIframe(url: string): Promise<boolean> {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (KNOWN_NO_IFRAME.some((d) => host === d || host.endsWith(`.${d}`))) {
      return false;
    }
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });
    const xfo = res.headers.get("x-frame-options")?.toLowerCase() ?? "";
    if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
    const csp = res.headers.get("content-security-policy")?.toLowerCase() ?? "";
    if (csp.includes("frame-ancestors")) {
      const m = csp.match(/frame-ancestors([^;]*)/);
      const val = m?.[1]?.trim() ?? "";
      if (val.includes("'none'") || val.includes("'self'")) return false;
      if (val.includes("*")) return true;
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function applyUtms(url: string, c: Record<string, unknown>) {
  try {
    const u = new URL(url);
    const set = (k: string, v: unknown) => {
      if (typeof v === "string" && v.trim() && !u.searchParams.has(k)) u.searchParams.set(k, v);
    };
    set("utm_source", c.utm_source);
    set("utm_medium", c.utm_medium);
    set("utm_campaign", c.utm_campaign);
    set("utm_term", c.utm_term);
    set("utm_content", c.utm_content);
    return u.toString();
  } catch {
    return url;
  }
}

function pickMeta(c: Record<string, unknown>) {
  return {
    name: (c.name as string) ?? null,
    link_title: (c.link_title as string) ?? null,
    link_description: (c.link_description as string) ?? null,
    preview_image_url: (c.preview_image_url as string) ?? null,
    favicon_url: (c.favicon_url as string) ?? null,
    og_title: (c.og_title as string) ?? null,
    og_description: (c.og_description as string) ?? null,
    og_image_url: (c.og_image_url as string) ?? null,
    og_type: (c.og_type as string) ?? null,
    link_intent: (c.link_intent as string) ?? null,
    campaign_type: (c.campaign_type as string) ?? null,
    page_category: (c.page_category as string) ?? null,
    intermediate_text: (c.intermediate_text as string) ?? null,
    cta_label: (c.cta_label as string) ?? null,
  };
}

const FACEBOOK_ASN_RE = /facebook|meta platforms/i;
function isFacebookGeo(geo: Record<string, unknown> | null): boolean {
  if (!geo) return false;
  const fields = [geo.isp, geo.org, geo.as, geo.asname]
    .filter((v): v is string => typeof v === "string");
  return fields.some((v) => FACEBOOK_ASN_RE.test(v));
}

/** Shared click writer used by both `resolveCampaign` (SSR loader) and the
 *  client fallback `trackClick`. Roda com service role e faz o enrich de
 *  UA/IP a partir dos headers da request atual. */
async function recordClick(
  supabaseAdmin: any,
  campaign: any,
  finalUrl: string,
  preloadedGeo?: Record<string, unknown> | null,
): Promise<string | null> {
  const ip = pickIp();
  const ua = getRequestHeader("user-agent") ?? null;
  const referer = getRequestHeader("referer") ?? null;
  const lang = getRequestHeader("accept-language") ?? null;

  let geo: Record<string, unknown> | null = preloadedGeo ?? null;
  if (!geo && ip) geo = await lookupIp(ip);

  let parsed: ReturnType<UAParser["getResult"]> | null = null;
  if (ua) {
    try { parsed = new UAParser(ua).getResult(); } catch { parsed = null; }
  }

  const isBot = ua ? BOT_RE.test(ua) : false;

  let isReturning = false;
  let isDuplicate = false;
  if (ip) {
    const sinceReturning = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sinceDuplicate = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: prior } = await supabaseAdmin
      .from("campaign_clicks")
      .select("id, clicked_at")
      .eq("campaign_id", campaign.id)
      .eq("ip", ip)
      .gte("clicked_at", sinceReturning)
      .order("clicked_at", { ascending: false })
      .limit(1);
    if (prior && prior.length > 0) {
      isReturning = true;
      if ((prior[0]?.clicked_at ?? "") >= sinceDuplicate) isDuplicate = true;
    }
  }

  const { data: inserted } = await supabaseAdmin
    .from("campaign_clicks")
    .insert({
      campaign_id: campaign.id,
      workspace_id: campaign.workspace_id ?? null,
      ip,
      ...mapGeoToRow(geo),
      device: parsed?.device?.model ?? parsed?.device?.vendor ?? null,
      device_type: parsed?.device?.type ?? "desktop",
      browser: parsed?.browser?.name ?? null,
      browser_version: parsed?.browser?.version ?? null,
      os: parsed?.os?.name ?? null,
      os_version: parsed?.os?.version ?? null,
      referer,
      user_agent: ua,
      language: lang,
      final_url: finalUrl,
    } as never)
    .select("id")
    .maybeSingle();

  const clickId = (inserted as { id?: string } | null)?.id ?? null;

  const autoEvents: { event_type: EventType; metadata: Record<string, unknown> }[] = [
    { event_type: "page_view", metadata: { referer, language: lang } },
  ];
  const hasUtm = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].some(
    (k) => (campaign as Record<string, unknown>)[k],
  );
  if (hasUtm) {
    autoEvents.push({
      event_type: "utm_detected",
      metadata: {
        source: campaign.utm_source,
        medium: campaign.utm_medium,
        campaign: campaign.utm_campaign,
      },
    });
  }
  if (isBot) autoEvents.push({ event_type: "bot_detected", metadata: { ua } });
  if (isReturning) autoEvents.push({ event_type: "returning_visitor", metadata: {} });
  if (isDuplicate) autoEvents.push({ event_type: "duplicate_click", metadata: {} });

  try {
    await supabaseAdmin.from("campaign_events").insert(
      autoEvents.map((e) => ({
        campaign_id: campaign.id,
        click_id: clickId,
        event_type: e.event_type,
        metadata: e.metadata,
      })) as never,
    );
  } catch {
    /* ignore */
  }

  return clickId;
}

/**
 * Fast resolver for the public `/$slug` route. Decide o modo de abertura
 * (smart/iframe/redirect/wrapper), devolve cache de iframe_compatible e
 * grava o clique/eventos imediatamente — garantindo métricas mesmo quando
 * o navegador é redirecionado antes do fetch fire-and-forget completar.
 */
export const resolveCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error || !campaign) {
      return { ok: false as const, notFound: true as const };
    }
    if (campaign.status && campaign.status !== "active") {
      return {
        ok: false as const,
        notFound: false as const,
        status: campaign.status as string,
        meta: pickMeta(campaign),
      };
    }

    const finalUrl = applyUtms(campaign.destination_url, campaign);
    const mode = ((campaign as Record<string, unknown>).open_mode as string) || "smart";

    let iframeAllowed = true;
    if (mode === "redirect") {
      iframeAllowed = false;
    } else if (mode === "iframe") {
      iframeAllowed = true;
    } else if (mode === "wrapper") {
      iframeAllowed = false;
    } else {
      const cached = (campaign as Record<string, unknown>).iframe_compatible;
      if (typeof cached === "boolean") {
        iframeAllowed = cached;
      } else {
        iframeAllowed = await canEmbedInIframe(finalUrl);
        try {
          await supabaseAdmin
            .from("campaigns")
            .update({
              iframe_compatible: iframeAllowed,
              iframe_checked_at: new Date().toISOString(),
            } as never)
            .eq("id", campaign.id);
        } catch {
          /* ignore */
        }
      }
    }

    // Grava clique/eventos server-side (mais robusto que o fire-and-forget
    // do cliente, que era abortado nos modos redirect/wrapper). Nunca falha
    // a resolução: se o insert der erro, seguimos com o redirect normal.
    try {
      await recordClick(supabaseAdmin, campaign, finalUrl);
    } catch {
      /* ignore — métricas não devem quebrar o link */
    }

    return {
      ok: true as const,
      destination_url: finalUrl,
      open_mode: mode as "smart" | "iframe" | "redirect" | "wrapper",
      iframeAllowed,
      meta: pickMeta(campaign),
    };
  });

/**
 * Fire-and-forget tracker called from the client after the wrapper renders.
 * Captures the visitor IP from request headers (so it works even though the
 * client triggers it) and writes the click row asynchronously.
 */
export const trackClick = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id, workspace_id, destination_url, status, utm_source, utm_medium, utm_campaign, utm_term, utm_content")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!campaign || (campaign.status && campaign.status !== "active")) {
      return { ok: false as const };
    }

    const finalUrl = applyUtms(campaign.destination_url, campaign as Record<string, unknown>);
    const ip = pickIp();
    const ua = getRequestHeader("user-agent") ?? null;
    const referer = getRequestHeader("referer") ?? null;
    const lang = getRequestHeader("accept-language") ?? null;

    let geo: Record<string, unknown> | null = null;
    if (ip) geo = await lookupIp(ip);

    let parsed: ReturnType<UAParser["getResult"]> | null = null;
    if (ua) {
      try { parsed = new UAParser(ua).getResult(); } catch { parsed = null; }
    }

    const isBot = ua ? BOT_RE.test(ua) : false;

    // Detecta clique duplicado / visitante recorrente nos últimos 30 dias.
    let isReturning = false;
    let isDuplicate = false;
    if (ip) {
      const sinceReturning = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sinceDuplicate = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: prior } = await supabaseAdmin
        .from("campaign_clicks")
        .select("id, clicked_at")
        .eq("campaign_id", campaign.id)
        .eq("ip", ip)
        .gte("clicked_at", sinceReturning)
        .order("clicked_at", { ascending: false })
        .limit(1);
      if (prior && prior.length > 0) {
        isReturning = true;
        if ((prior[0]?.clicked_at ?? "") >= sinceDuplicate) isDuplicate = true;
      }
    }

    const { data: inserted } = await supabaseAdmin
      .from("campaign_clicks")
      .insert({
        campaign_id: campaign.id,
        workspace_id: (campaign as { workspace_id?: string | null }).workspace_id ?? null,
        ip,
        ...mapGeoToRow(geo),
        device: parsed?.device?.model ?? parsed?.device?.vendor ?? null,
        device_type: parsed?.device?.type ?? "desktop",
        browser: parsed?.browser?.name ?? null,
        browser_version: parsed?.browser?.version ?? null,
        os: parsed?.os?.name ?? null,
        os_version: parsed?.os?.version ?? null,
        referer,
        user_agent: ua,
        language: lang,
        final_url: finalUrl,
      } as never)
      .select("id")
      .maybeSingle();

    const clickId = (inserted as { id?: string } | null)?.id ?? null;

    // Eventos automáticos derivados do clique.
    const autoEvents: { event_type: EventType; metadata: Record<string, unknown> }[] = [
      { event_type: "page_view", metadata: { referer, language: lang } },
    ];
    const hasUtm = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].some(
      (k) => (campaign as Record<string, unknown>)[k],
    );
    if (hasUtm) {
      autoEvents.push({
        event_type: "utm_detected",
        metadata: {
          source: (campaign as Record<string, unknown>).utm_source,
          medium: (campaign as Record<string, unknown>).utm_medium,
          campaign: (campaign as Record<string, unknown>).utm_campaign,
        },
      });
    }
    if (isBot) autoEvents.push({ event_type: "bot_detected", metadata: { ua } });
    if (isReturning) autoEvents.push({ event_type: "returning_visitor", metadata: {} });
    if (isDuplicate) autoEvents.push({ event_type: "duplicate_click", metadata: {} });

    try {
      await supabaseAdmin.from("campaign_events").insert(
        autoEvents.map((e) => ({
          campaign_id: campaign.id,
          click_id: clickId,
          event_type: e.event_type,
          metadata: e.metadata,
        })) as never,
      );
    } catch {
      /* ignore */
    }

    return { ok: true as const, click_id: clickId };
  });

/**
 * Registra um evento granular emitido pelo cliente (ex.: iframe_loaded,
 * iframe_blocked, redirect_started, cta_clicked). Não bloqueia o usuário.
 */
export const trackEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => eventInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!campaign || (campaign.status && campaign.status !== "active")) {
      return { ok: false as const };
    }
    try {
      await supabaseAdmin.from("campaign_events").insert({
        campaign_id: campaign.id,
        event_type: data.event_type,
        metadata: data.metadata ?? {},
      } as never);
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  });
