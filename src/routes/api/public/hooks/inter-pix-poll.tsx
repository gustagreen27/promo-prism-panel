import { createFileRoute } from "@tanstack/react-router";

// Chamado a cada minuto SOMENTE enquanto houver Pix pendente.
// Consulta o Inter com intervalo crescente por cobrança (respeita limites da API)
// e desliga o agendamento quando não há mais pendências.
export const Route = createFileRoute("/api/public/hooks/inter-pix-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { checkDeposit } = await import("@/lib/inter-pix.server");

        const { data: rows } = await supabaseAdmin
          .from("deposits")
          .select("*")
          .eq("status", "pending")
          .eq("provider", "inter")
          .order("last_checked_at", { ascending: true, nullsFirst: true })
          .limit(30);

        const now = Date.now();
        const results: Record<string, number> = {};
        let checked = 0;
        for (const d of rows ?? []) {
          const age = now - new Date(d.created_at).getTime();
          // 1 min nos primeiros 20 min; depois a cada 3 min até expirar.
          const gap = age < 20 * 60_000 ? 55_000 : 175_000;
          if (d.last_checked_at && now - new Date(d.last_checked_at).getTime() < gap) continue;
          if (checked >= 20) break;
          checked++;
          const r = await checkDeposit(supabaseAdmin, d).catch((e) => {
            console.error("[inter-pix-poll]", d.id, e);
            return "error";
          });
          results[r] = (results[r] ?? 0) + 1;
        }
        const { data: stopped } = await supabaseAdmin.rpc("inter_pix_poll_stop_if_idle");
        return Response.json({ ok: true, checked, results, stopped });
      },
    },
  },
});
