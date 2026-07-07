import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/wa-templates-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!authHeader || !expected || authHeader !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncAllConnections } = await import("@/lib/wa-templates-sync.server");
          const result = await syncAllConnections(supabaseAdmin);
          return new Response(JSON.stringify({ ok: true, ...result }), { headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          console.error("wa-templates-sync failed:", e?.message ?? e);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "sync_failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
      GET: async () => new Response(JSON.stringify({ ok: true, hint: "POST with apikey header to run sync" }), { headers: { "Content-Type": "application/json" } }),
    },
  },
});
