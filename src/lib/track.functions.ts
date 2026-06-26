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
  if (!key) return null;
  const fields =
    "status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query";
  try {
    const res = await fetch(
      `https://pro.ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}&key=${key}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (j.status !== "success") return null;
    return j;
  } catch {
    return null;
  }
}

async function canEmbedInIframe(url: string): Promise<boolean> {
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
      // permissive (* or specific other hosts) — best effort allow
      if (val.includes("*")) return true;
      return false;
    }
    return true;
  } catch {
    // Network failure: optimistic allow; client will fall back if needed
    return true;
  }
}

export const trackClick = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign, error } = await supabaseAdmin
      .from("campaigns")
      .select("id, destination_url")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error || !campaign) {
      return { ok: false as const, notFound: true };
    }

    const ip = pickIp();
    const ua = getRequestHeader("user-agent") ?? null;
    const referer = getRequestHeader("referer") ?? null;
    const lang = getRequestHeader("accept-language") ?? null;

    let geo: Record<string, unknown> | null = null;
    if (ip) geo = await lookupIp(ip);

    let parsed: ReturnType<UAParser["getResult"]> | null = null;
    if (ua) {
      try {
        parsed = new UAParser(ua).getResult();
      } catch {
        parsed = null;
      }
    }

    const iframeAllowed = await canEmbedInIframe(campaign.destination_url);

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
    });

    return {
      ok: true as const,
      destination_url: campaign.destination_url,
      iframeAllowed,
    };
  });
