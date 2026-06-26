import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { UAParser } from "ua-parser-js";

const inputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

function pickIp(): string | null {
  const xff = getRequestHeader("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = getRequestHeader("x-real-ip");
  if (real) return real.trim();
  return getRequestIP() ?? null;
}

async function lookupIp(ip: string) {
  const key = process.env.IP_API_KEY;
  const fields =
    "status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query";
  const url = key
    ? `https://pro.ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}&key=${key}`
    : `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`;
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

export async function canEmbedInIframe(url: string): Promise<boolean> {
  try {
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
  };
}

/**
 * Fast resolver for the public `/$slug` route. Runs the iframe HEAD check
 * (cheap) but does NOT call IP-API or insert the click log — that's deferred
 * to `trackClick` fired in the background from the client.
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
    const iframeAllowed = await canEmbedInIframe(finalUrl);

    return {
      ok: true as const,
      destination_url: finalUrl,
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
      .select("id, destination_url, status, utm_source, utm_medium, utm_campaign, utm_term, utm_content")
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

    await supabaseAdmin.from("campaign_clicks").insert({
      campaign_id: campaign.id,
      ip,
      country: (geo?.country as string) ?? null,
      country_code: (geo?.countryCode as string) ?? null,
      region: (geo?.regionName as string) ?? null,
      city: (geo?.city as string) ?? null,
      zip: (geo?.zip as string) ?? null,
      lat: (geo?.lat as number) ?? null,
      lon: (geo?.lon as number) ?? null,
      timezone: (geo?.timezone as string) ?? null,
      isp: (geo?.isp as string) ?? null,
      org: (geo?.org as string) ?? null,
      as_name: (geo?.as as string) ?? null,
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
    } as never);

    return { ok: true as const };
  });
