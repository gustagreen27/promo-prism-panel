// Token-gated internal harness endpoint (Fase 2).
// Segurança:
//  - token lido apenas de process.env.WA_HARNESS_TOKEN (backend);
//  - autentica SOMENTE via header Authorization: Bearer <token> ou x-harness-token;
//    nunca aceita token por query string, URL ou body;
//  - desabilitado em produção sem WA_HARNESS_ENABLED=1;
//  - transporte fake só executa depois das duas guards (env + token);
//  - falha => 401 genérico, sem eco do token, sem stack em produção;
//  - rate limit por IP (in-memory) para conter brute force;
//  - telemetria segura: harness_started/finished, scenario_id, requested_rate,
//    simulated_latency, authorized — nunca o header nem o token.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, randomUUID } from "node:crypto";

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

// Rate limit simples por IP (janela deslizante de 60s, máx 20 tentativas).
const RL_WINDOW_MS = 60_000;
const RL_MAX = 20;
const rlBuckets = new Map<string, number[]>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (rlBuckets.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_MAX) {
    rlBuckets.set(ip, arr);
    return false;
  }
  arr.push(now);
  rlBuckets.set(ip, arr);
  return true;
}
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export const Route = createFileRoute("/api/public/whatsapp/harness")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const nodeEnv = process.env.NODE_ENV;
        const enabledFlag = process.env.WA_HARNESS_ENABLED === "1";
        if (nodeEnv === "production" && !enabledFlag) {
          return new Response("not found", { status: 404 });
        }

        const ip = clientIp(request);
        if (!rateLimit(ip)) {
          console.log(JSON.stringify({ event: "harness_rate_limited", ip }));
          return new Response("too many requests", { status: 429 });
        }

        const expected = process.env.WA_HARNESS_TOKEN;
        const provided = extractToken(request);
        const authorized =
          !!expected && !!provided && safeEqual(provided, expected);
        if (!authorized) {
          console.log(
            JSON.stringify({ event: "harness_auth_failed", ip, authorized: false }),
          );
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

        const scenarioId = randomUUID();
        console.log(
          JSON.stringify({
            event: "harness_started",
            scenario_id: scenarioId,
            requested_rate: rate,
            simulated_latency: latencyMs,
            recipients,
            ticks,
            authorized: true,
          }),
        );

        const startedAt = Date.now();
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
          console.log(
            JSON.stringify({
              event: "harness_finished",
              scenario_id: scenarioId,
              requested_rate: rate,
              simulated_latency: latencyMs,
              duration_ms: Date.now() - startedAt,
              ok: true,
            }),
          );
          return new Response(
            JSON.stringify({ scenario_id: scenarioId, ...metrics }, null, 2),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (err: any) {
          console.log(
            JSON.stringify({
              event: "harness_finished",
              scenario_id: scenarioId,
              requested_rate: rate,
              simulated_latency: latencyMs,
              duration_ms: Date.now() - startedAt,
              ok: false,
              error: err?.message ?? "harness failed",
            }),
          );
          const payload: Record<string, unknown> = {
            scenario_id: scenarioId,
            error: err?.message ?? "harness failed",
          };
          if (nodeEnv !== "production") payload.stack = err?.stack ?? null;
          return new Response(JSON.stringify(payload, null, 2), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
