import { createFileRoute } from "@tanstack/react-router";
import { metaEgressFetch, describeEgress, isMetaEgressError } from "@/lib/meta/meta-egress";

/**
 * Endpoint TEMPORÁRIO de diagnóstico.
 * Retorna apenas o IP público de saída visto por serviços externos a partir
 * do runtime do backend. Não expõe headers, tokens nem credenciais.
 *
 * ?via=proxy  → usa exatamente o mesmo caminho de rede das chamadas à Meta
 *               (porta única de egress). Serve para validar que o IP visto
 *               externamente passou a ser o IP do proxy fixo.
 */
export const Route = createFileRoute("/api/public/diag/egress-ip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const started = Date.now();
        const via = new URL(request.url).searchParams.get("via");
        const useEgress = via === "proxy" || via === "meta";
        const results: Array<{ source: string; ip: string | null; info?: unknown; error?: string }> = [];

        const call = async (url: string) =>
          useEgress ? await metaEgressFetch(url, { timeoutMs: 10_000 }) : await fetch(url);

        try {
          const r = await call("https://api.ipify.org?format=json");
          const j = (await r.json().catch(() => ({}))) as { ip?: string };
          results.push({ source: "ipify", ip: j?.ip ?? null });
        } catch (e: unknown) {
          results.push({
            source: "ipify",
            ip: null,
            error: isMetaEgressError(e) ? `${e.code}` : "network_error",
          });
        }

        try {
          const r = await call("https://ipinfo.io/json");
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
        } catch (e: unknown) {
          results.push({
            source: "ipinfo",
            ip: null,
            error: isMetaEgressError(e) ? `${e.code}` : "network_error",
          });
        }

        return Response.json(
          {
            path: useEgress ? "meta_egress" : "direct",
            egress: describeEgress(),
            results,
            elapsed_ms: Date.now() - started,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
