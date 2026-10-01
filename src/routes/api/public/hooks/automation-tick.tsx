// Scheduler das Automações: processa eventos, agendamentos e trabalhos vencidos.
// Chamado por pg_cron (só existe enquanto há trabalho pendente). Autenticado por segredo interno.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/automation-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
  if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const eng = await import("@/lib/automation-engine.server");
  const holder = `tick-${crypto.randomUUID()}`;
  try {
    await eng.processEvents(supabaseAdmin);
    await eng.processScheduled(supabaseAdmin);
    const { processed } = await eng.processDueJobs(supabaseAdmin, holder, 20000);
    const { data: stopped } = await supabaseAdmin.rpc("automation_tick_stop_if_idle");
    return Response.json({ ok: true, processed, stopped });
  } catch (e: any) {
    console.error("automation-tick", e);
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
