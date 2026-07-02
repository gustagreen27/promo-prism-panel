import { createFileRoute } from "@tanstack/react-router";

/**
 * Health-check para o webhook do WhatsApp.
 *
 * Uso:
 *  GET /api/public/whatsapp/webhook-health
 *    → diagnóstico geral: quantas conexões existem e quantas têm verify_token salvo.
 *
 *  GET /api/public/whatsapp/webhook-health?hub.mode=subscribe
 *      &hub.verify_token=XYZ&hub.challenge=123
 *    → simula exatamente o que a Meta faz. Retorna JSON explicando o resultado
 *      (sem devolver o challenge cru — para não ser confundido com o webhook real).
 *
 * NÃO expõe o valor do token. Só diz se casou com alguma conexão e qual.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Diagnóstico geral do banco
        const { data: conns, error: connErr } = await supabaseAdmin
          .from("whatsapp_connections")
          .select("id, name, display_phone, phone_number_id, verify_token");

        if (connErr) {
          return json(
            {
              ok: false,
              stage: "db",
              error: connErr.message,
              hint: "Falha ao ler whatsapp_connections. Verifique credenciais do backend.",
            },
            500,
          );
        }

        const total = conns?.length ?? 0;
        const withToken =
          conns?.filter((c) => typeof c.verify_token === "string" && c.verify_token.length > 0)
            .length ?? 0;

        // Se veio no formato da Meta, simular a verificação
        if (mode || token || challenge) {
          if (mode !== "subscribe") {
            return json(
              {
                ok: false,
                stage: "verify",
                reason: "invalid_mode",
                received_mode: mode,
                expected_mode: "subscribe",
                hint: "A Meta envia hub.mode=subscribe. Qualquer outro valor é rejeitado.",
              },
              200,
            );
          }
          if (!token) {
            return json(
              {
                ok: false,
                stage: "verify",
                reason: "missing_token",
                hint: "hub.verify_token ausente na query string.",
              },
              200,
            );
          }

          const match = conns?.find((c) => c.verify_token === token);
          if (!match) {
            return json(
              {
                ok: false,
                stage: "verify",
                reason: "token_not_found",
                token_length: token.length,
                connections_total: total,
                connections_with_token: withToken,
                hint:
                  "Nenhuma conexão possui esse verify_token. Salve o token exato em Admin → WhatsApp → Webhooks → Verify Tokens por número.",
              },
              200,
            );
          }

          return json(
            {
              ok: true,
              stage: "verify",
              matched_connection: {
                id: match.id,
                name: match.name,
                display_phone: match.display_phone ?? null,
                phone_number_id: match.phone_number_id ?? null,
              },
              would_return_challenge: challenge ?? null,
              note:
                "Este endpoint é apenas diagnóstico. Configure na Meta a URL /api/public/whatsapp/webhook (sem -health) para a validação oficial.",
            },
            200,
          );
        }

        // Diagnóstico geral (sem params)
        return json(
          {
            ok: true,
            stage: "overview",
            webhook_url: `${url.origin}/api/public/whatsapp/webhook`,
            connections_total: total,
            connections_with_token: withToken,
            connections: (conns ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              display_phone: c.display_phone ?? null,
              phone_number_id: c.phone_number_id ?? null,
              has_verify_token: Boolean(c.verify_token),
              verify_token_length: c.verify_token ? c.verify_token.length : 0,
            })),
            usage: {
              simulate_meta_verify:
                `${url.origin}/api/public/whatsapp/webhook-health` +
                `?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=123`,
            },
          },
          200,
        );
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
