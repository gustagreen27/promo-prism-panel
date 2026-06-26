import { createFileRoute } from "@tanstack/react-router";

// Public proxy that streams images from the private `campaign-images` bucket
// so they can be used as og:image / favicon / preview by crawlers and the public page.
export const Route = createFileRoute("/api/public/ci/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        if (!path || path.includes("..")) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("campaign-images")
          .download(path);
        if (error || !data) {
          return new Response("Not found", { status: 404 });
        }
        const buf = await data.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": data.type || "application/octet-stream",
            "Cache-Control": "public, max-age=300, s-maxage=86400",
          },
        });
      },
    },
  },
});
