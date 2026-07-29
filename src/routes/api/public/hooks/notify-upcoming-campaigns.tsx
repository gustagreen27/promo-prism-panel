import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/notify-upcoming-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = Date.now();
        const from = new Date(now + 8 * 60 * 1000).toISOString();
        const to = new Date(now + 12 * 60 * 1000).toISOString();
        const { data: rows } = await supabaseAdmin
          .from("wa_campaigns")
          .select("id,name,workspace_id,scheduled_at")
          .eq("status", "scheduled")
          .gte("scheduled_at", from)
          .lte("scheduled_at", to);
        for (const r of rows ?? []) {
          if (!r.workspace_id) continue;
          const { data: already } = await supabaseAdmin
            .from("notifications")
            .select("id")
            .eq("workspace_id", r.workspace_id)
            .eq("kind", "campaign.starting_soon")
            .contains("metadata", { campaign_id: r.id })
            .limit(1)
            .maybeSingle();
          if (already) continue;
          await supabaseAdmin.rpc("notify_workspace" as any, {
            _ws: r.workspace_id,
            _kind: "campaign.starting_soon",
            _title: "Campanha inicia em breve",
            _body: `"${r.name}" está agendada para ${new Date(r.scheduled_at as string).toLocaleString("pt-BR")}.`,
            _link: "/painel/agenda",
            _severity: "info",
            _metadata: { campaign_id: r.id },
          });
        }
        return Response.json({ ok: true, notified: rows?.length ?? 0 });
      },
    },
  },
});
