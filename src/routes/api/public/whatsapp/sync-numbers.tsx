import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint — sincroniza números de todas as WABAs a partir da Meta.
 * Auth: header `apikey: <SUPABASE_PUBLISHABLE_KEY>` (padrão pg_cron).
 */
export const Route = createFileRoute("/api/public/whatsapp/sync-numbers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { _syncOneWabaInternal } = await import("@/lib/wa-meta-sync.functions");

        const { data: wabas, error } = await supabaseAdmin
          .from("whatsapp_wabas")
          .select("id, waba_id, business_id, access_token, client_id, project_id, workspace_id, status")
          .neq("status", "suspenso");
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const results: any[] = [];
        for (const w of wabas ?? []) {
          try {
            results.push(await _syncOneWabaInternal(supabaseAdmin, w as any));
          } catch (e: any) {
            results.push({ waba_ref_id: w.id, waba_id: w.waba_id, error: e?.message ?? "erro" });
          }
        }

        return Response.json({
          ok: true,
          ran_at: new Date().toISOString(),
          wabas: results.length,
          results,
        });
      },
    },
  },
});
