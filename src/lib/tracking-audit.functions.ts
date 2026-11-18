import { createServerFn } from "@tanstack/react-start";
import { aiEndpoint } from "@/lib/ai-endpoint.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BOT_RE = /bot|crawl|spider|facebookexternalhit|preview|headless|python|curl|wget/i;

export type AuditFinding = { severity: "alta" | "media" | "baixa"; title: string; detail: string; suggestion: string };
export type AuditResult = {
  stats: Record<string, string | number | boolean | null | object>;
  summary: string;
  findings: AuditFinding[];
  truncated: boolean;
};

function top(map: Map<string, number>, n = 8) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));
}
function inc(m: Map<string, number>, k: string | null | undefined) {
  const key = k || "(vazio)";
  m.set(key, (m.get(key) ?? 0) + 1);
}

export const analyzeTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ campaignId: z.string().uuid(), from: z.string().datetime(), to: z.string().datetime() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AuditResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: camp } = await supabaseAdmin
      .from("campaigns")
      .select("name, slug, status, open_mode, iframe_compatible, destination_url, facebook_destination_url")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!camp) throw new Error("Campanha não encontrada.");

    const LIMIT = 20000;
    const clicks: any[] = [];
    for (let off = 0; off < LIMIT; off += 1000) {
      const { data: rows, error } = await supabaseAdmin
        .from("campaign_clicks")
        .select("id, clicked_at, ip, user_agent, browser, os, device_type, country_code, city, isp, referer, final_url, proxy, hosting")
        .eq("campaign_id", data.campaignId)
        .gte("clicked_at", data.from)
        .lte("clicked_at", data.to)
        .order("clicked_at", { ascending: true })
        .range(off, off + 999);
      if (error) throw new Error(error.message);
      clicks.push(...(rows ?? []));
      if (!rows || rows.length < 1000) break;
    }
    const truncated = clicks.length >= LIMIT;

    const events = new Map<string, number>();
    let eventsNoClick = 0;
    for (let off = 0; off < 50000; off += 1000) {
      const { data: rows } = await supabaseAdmin
        .from("campaign_events")
        .select("event_type, click_id")
        .eq("campaign_id", data.campaignId)
        .gte("created_at", data.from)
        .lte("created_at", data.to)
        .range(off, off + 999);
      for (const r of rows ?? []) {
        inc(events, r.event_type as string);
        if (!r.click_id) eventsNoClick++;
      }
      if (!rows || rows.length < 1000) break;
    }

    const ips = new Set<string>();
    const byDay = new Map<string, number>(), byHour = new Map<string, number>();
    const browsers = new Map<string, number>(), oses = new Map<string, number>(), devices = new Map<string, number>();
    const countries = new Map<string, number>(), isps = new Map<string, number>(), referers = new Map<string, number>();
    let noIp = 0, noUa = 0, noGeo = 0, bots = 0, proxies = 0, quickRepeats = 0;
    const lastByIp = new Map<string, number>();
    let maxGapMin = 0, prevTs = 0;
    for (const c of clicks) {
      const ts = new Date(c.clicked_at).getTime();
      if (prevTs) maxGapMin = Math.max(maxGapMin, (ts - prevTs) / 60000);
      prevTs = ts;
      if (c.ip) {
        ips.add(c.ip);
        const last = lastByIp.get(c.ip);
        if (last && ts - last < 60000) quickRepeats++;
        lastByIp.set(c.ip, ts);
      } else noIp++;
      if (!c.user_agent) noUa++;
      else if (BOT_RE.test(c.user_agent)) bots++;
      if (!c.country_code) noGeo++;
      if (c.proxy || c.hosting) proxies++;
      const d = new Date(ts - 3 * 3600000).toISOString();
      inc(byDay, d.slice(0, 10));
      inc(byHour, d.slice(11, 13) + "h");
      inc(browsers, c.browser); inc(oses, c.os); inc(devices, c.device_type);
      inc(countries, c.country_code); inc(isps, c.isp);
      let ref = "(direto)";
      try { if (c.referer) ref = new URL(c.referer).hostname; } catch { /* ignore */ }
      inc(referers, ref);
    }

    const stats = {
      campanha: camp,
      periodo: { de: data.from, ate: data.to },
      cliques_total: clicks.length,
      ips_unicos: ips.size,
      sem_ip: noIp, sem_user_agent: noUa, sem_geolocalizacao: noGeo,
      bots_por_user_agent: bots, proxy_ou_datacenter: proxies,
      repeticoes_mesmo_ip_menos_60s: quickRepeats,
      maior_intervalo_sem_cliques_min: Math.round(maxGapMin),
      eventos: Object.fromEntries(events),
      eventos_sem_clique_vinculado: eventsNoClick,
      por_dia: Object.fromEntries([...byDay.entries()].sort()),
      por_hora: Object.fromEntries([...byHour.entries()].sort()),
      navegadores: top(browsers), sistemas: top(oses), dispositivos: top(devices),
      paises: top(countries), provedores: top(isps), origens: top(referers),
      amostra_limitada: truncated,
    };

    const ai = aiEndpoint("/responses", "openai/gpt-6-astra", "fetch");
    if (!ai.available) throw new Error("Análise por IA indisponível no momento.");
    const system =
      "Você audita rastreamento de cliques de links públicos. Cada acesso ao link deveria gerar 1 clique e eventos page_view e, conforme o modo, redirect_started/redirect_completed ou iframe_loaded/iframe_blocked. " +
      "'Cliques únicos' contam IPs distintos. Analise só os números fornecidos; não invente. Aponte possíveis falhas de rastreamento (perda de cliques, eventos sem par, dados de IP/geo ausentes, bots inflando, quedas súbitas, picos anormais, redirecionamentos não concluídos, iframe bloqueado). " +
      "Responda em português do Brasil, linguagem simples, no máximo 8 achados. Se tudo estiver normal, diga isso e retorne poucos ou nenhum achado.";
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["summary", "findings"],
      properties: {
        summary: { type: "string" },
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "title", "detail", "suggestion"],
            properties: {
              severity: { type: "string", enum: ["alta", "media", "baixa"] },
              title: { type: "string" },
              detail: { type: "string" },
              suggestion: { type: "string" },
            },
          },
        },
      },
    };
    const res = await fetch(ai.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ai.headers },
      body: JSON.stringify({
        model: ai.model,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: system,
        input: [{ role: "user", content: JSON.stringify(stats) }],
        text: { format: { type: "json_schema", name: "tracking_audit", strict: true, schema } },
      }),
    });
    if (res.status === 429) throw new Error("Muitas análises seguidas. Tente de novo em alguns instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok || !res.body) throw new Error(`Falha na análise (${res.status}).`);

    // Consome o stream SSE e junta o texto final.
    let text = "";
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
          if (ev.type === "error" || ev.type === "response.failed") throw new Error("Falha na análise da IA.");
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Falha")) throw e;
        }
      }
    }
    let parsed: { summary?: string; findings?: AuditFinding[] } = {};
    try { parsed = JSON.parse(text); } catch { parsed = { summary: text }; }
    return { stats: JSON.parse(JSON.stringify(stats)) as AuditResult["stats"], summary: parsed.summary ?? "", findings: parsed.findings ?? [], truncated };
  });
