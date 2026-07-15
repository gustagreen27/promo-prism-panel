// Token-gated public endpoint to run the Fase 2 harness.
// Uso: POST /api/public/whatsapp/harness com header x-harness-token e body
// { rate, latencyMs, recipients, ticks, campConc?, globalMaxConc?, numberMaxRate?, reservationBudget? }
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/harness")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-harness-token");
        const expected1 = process.env.WA_HARNESS_TOKEN;
        const expected2 = process.env.WA_HARNESS_TOKEN_ALT;
        if (!expected1 && !expected2) {
          return new Response("harness disabled: no token env set", { status: 503 });
        }
        const ok = !!token && ((expected1 && token === expected1) || (expected2 && token === expected2));
        if (!ok) {
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
          return new Response(
            JSON.stringify({ error: err?.message ?? String(err), stack: err?.stack ?? null }, null, 2),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
