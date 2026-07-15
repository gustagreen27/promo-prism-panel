// Token-gated internal harness endpoint (Fase 2).
// Requisitos de segurança:
//  - lê o token apenas de process.env.WA_HARNESS_TOKEN (backend)
//  - autentica via Authorization: Bearer <token> OU header x-harness-token
//  - desabilitado por padrão em produção (exige WA_HARNESS_ENABLED=1)
//  - transporte fake (harness) só executa quando ambas as guards passam
//  - falha => 401 genérico, sem vazar motivo, sem eco do token, sem stack em produção
//  - sem fallback: sem token válido não roda nada
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const x = request.headers.get("x-harness-token");
  return x ? x.trim() : null;
}

export const Route = createFileRoute("/api/public/whatsapp/harness")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Gate de ambiente: em produção o harness só liga com WA_HARNESS_ENABLED=1
        const nodeEnv = process.env.NODE_ENV;
        const enabledFlag = process.env.WA_HARNESS_ENABLED === "1";
        if (nodeEnv === "production" && !enabledFlag) {
          return new Response("not found", { status: 404 });
        }

        // Token obrigatório, apenas do backend. Sem token configurado => 401 (nunca 200).
        const expected = process.env.WA_HARNESS_TOKEN;
        const provided = extractToken(request);
        if (!expected || !provided || !safeEqual(provided, expected)) {
          return new Response("unauthorized", { status: 401 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid JSON body", { status: 400 });
        }
        const rate = Number(body?.rate);
        const latencyMs = Number(body?.latencyMs);
        const recipients = Number(body?.recipients);
        const ticks = Number(body?.ticks ?? 3);
        if (!rate || !recipients || !Number.isFinite(latencyMs)) {
          return new Response("missing rate|latencyMs|recipients", { status: 400 });
        }
        try {
          const { runScenario } = await import("@/lib/wa-queue-harness.server");
          const metrics = await runScenario({
            rate,
            latencyMs,
            recipients,
            ticks,
            campConc: body?.campConc,
            globalMaxConc: body?.globalMaxConc,
            numberMaxRate: body?.numberMaxRate,
            reservationBudget: body?.reservationBudget,
          });
          return new Response(JSON.stringify(metrics, null, 2), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          // Nunca ecoa o token ou headers. Stack só fora de produção.
          const payload: Record<string, unknown> = {
            error: err?.message ?? "harness failed",
          };
          if (nodeEnv !== "production") {
            payload.stack = err?.stack ?? null;
          }
          return new Response(JSON.stringify(payload, null, 2), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
