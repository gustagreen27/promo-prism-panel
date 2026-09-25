import { createFileRoute } from "@tanstack/react-router";

// Diagnóstico temporário: testa se este backend consegue apresentar o
// certificado do Inter (mTLS de saída). Protegido por INTER_PROXY_SECRET.
export const Route = createFileRoute("/api/public/diag/inter-mtls")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-diag") !== "inter-mtls-2026") {
          return new Response("forbidden", { status: 403 });
        }
        const cert = (process.env["INTER_CERT_PEM"] ?? "").replace(/\\n/g, "\n");
        const key = (process.env["INTER_KEY_PEM"] ?? "").replace(/\\n/g, "\n");
        const body = new URLSearchParams({
          client_id: process.env["INTER_CLIENT_ID"] ?? "",
          client_secret: process.env["INTER_CLIENT_SECRET"] ?? "",
          grant_type: "client_credentials",
          scope: "cob.read",
        }).toString();
        const out: Record<string, unknown> = {
          has_cert: cert.includes("BEGIN CERTIFICATE"),
          has_key: key.includes("PRIVATE KEY"),
        };

        // 1) fetch comum (sem certificado)
        try {
          const r = await fetch("https://cdpj.partners.bancointer.com.br/oauth/v2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          out.fetch_plain = { status: r.status, body: (await r.text()).slice(0, 200) };
        } catch (e) {
          out.fetch_plain = { error: String((e as Error).message ?? e) };
        }

        // 2) node:https com cert/key
        try {
          const https = await import("node:https");
          out.node_https = await new Promise((resolve) => {
            const req = https.request(
              {
                hostname: "cdpj.partners.bancointer.com.br",
                path: "/oauth/v2/token",
                method: "POST",
                cert,
                key,
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Content-Length": Buffer.byteLength(body),
                },
              },
              (res) => {
                let t = "";
                res.on("data", (c) => (t += c));
                res.on("end", () =>
                  resolve({ status: res.statusCode, ok_token: t.includes("access_token"), body: t.includes("access_token") ? "[token recebido]" : t.slice(0, 200) }),
                );
              },
            );
            req.on("error", (e) => resolve({ error: String(e.message ?? e) }));
            req.write(body);
            req.end();
          });
        } catch (e) {
          out.node_https = { error: String((e as Error).message ?? e) };
        }
        return Response.json(out);
      },
    },
  },
});
