import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint TEMPORÁRIO de diagnóstico.
 * Retorna apenas o IP público de saída visto por serviços externos a partir
 * do runtime do backend. Não expõe headers, tokens nem credenciais.
 */
export const Route = createFileRoute("/api/public/diag/egress-ip")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const results: Array<{ source: string; ip: string | null; info?: unknown }> = [];

        try {
          const r = await fetch("https://api.ipify.org?format=json");
          const j = (await r.json().catch(() => ({}))) as { ip?: string };
          results.push({ source: "ipify", ip: j?.ip ?? null });
        } catch {
          results.push({ source: "ipify", ip: null });
        }

        try {
          const r = await fetch("https://ipinfo.io/json");
          const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
          results.push({
            source: "ipinfo",
            ip: (j["ip"] as string) ?? null,
            info: {
              city: j["city"] ?? null,
              region: j["region"] ?? null,
              country: j["country"] ?? null,
              org: j["org"] ?? null,
            },
          });
        } catch {
          results.push({ source: "ipinfo", ip: null });
        }

        return Response.json(
          { results, elapsed_ms: Date.now() - started },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
