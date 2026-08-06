import { createFileRoute } from "@tanstack/react-router";

/**
 * Atualização periódica do health_status (chamado por pg_cron).
 * Revalida todos os números e os templates aprovados, gravando cache + histórico.
 */
export const Route = createFileRoute("/api/public/whatsapp/health-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { refreshConnectionHealth, refreshTemplateHealth } = await import("@/lib/meta/wa-health.server");

        const started = Date.now();
        const errors: string[] = [];
        let numbers = 0;
        let templates = 0;

        const { data: conns } = await supabaseAdmin
          .from("whatsapp_connections")
          .select("id")
          .not("phone_number_id", "is", null);
        for (const c of conns ?? []) {
          try { await refreshConnectionHealth(supabaseAdmin, c.id); numbers++; }
          catch (e: any) { errors.push(`conn ${c.id}: ${e?.message}`); }
        }

        const { data: tpls } = await supabaseAdmin
          .from("whatsapp_templates")
          .select("id")
          .eq("status", "approved")
          .not("meta_template_id", "is", null)
          .limit(100);
        for (const t of tpls ?? []) {
          try { await refreshTemplateHealth(supabaseAdmin, t.id); templates++; }
          catch (e: any) { errors.push(`tpl ${t.id}: ${e?.message}`); }
        }

        return Response.json({ ok: true, numbers, templates, errors, ms: Date.now() - started });
      },
    },
  },
});
