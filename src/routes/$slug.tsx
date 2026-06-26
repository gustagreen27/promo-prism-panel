import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { trackClick } from "@/lib/track.functions";

export const Route = createFileRoute("/$slug")({
  head: () => ({ meta: [{ title: "Campanha" }] }),
  loader: async ({ params }) => {
    const res = await trackClick({ data: { slug: params.slug } });
    if (!res.ok) {
      return { status: "notfound" as const };
    }
    if (!res.iframeAllowed) {
      throw redirect({ href: res.destination_url });
    }
    return { status: "iframe" as const, url: res.destination_url };
  },
  component: CampaignPublicPage,
});

function CampaignPublicPage() {
  const data = Route.useLoaderData();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Client-side fallback: even when the server's HEAD/GET check passed,
  // the actual frame load may still be blocked (UA-conditional headers,
  // CSP frame-ancestors evaluated only in real frame context, network
  // errors, etc.). If so, redirect the top window to the destination.
  useEffect(() => {
    if (data.status !== "iframe") return;
    const url = data.url;
    let done = false;
    const fallback = () => {
      if (done) return;
      done = true;
      window.location.replace(url);
    };
    const check = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        // Same-origin access succeeded → remote didn't load (browser kept
        // about:blank because of X-Frame-Options / CSP). Redirect.
        if (doc && (!doc.body || doc.body.children.length === 0)) {
          fallback();
        }
      } catch {
        // Cross-origin access denied = iframe actually loaded the remote.
      }
    };
    const iframe = iframeRef.current;
    const onLoad = () => setTimeout(check, 100);
    iframe?.addEventListener("load", onLoad);
    iframe?.addEventListener("error", fallback);
    const t1 = setTimeout(check, 1500);
    const t2 = setTimeout(check, 4000);
    return () => {
      done = true;
      clearTimeout(t1);
      clearTimeout(t2);
      iframe?.removeEventListener("load", onLoad);
      iframe?.removeEventListener("error", fallback);
    };
  }, [data]);

  if (data.status === "notfound") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Campanha não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verifique o link ou contate o responsável pela campanha.
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={data.url}
      title="Campanha"
      className="fixed inset-0 h-screen w-screen border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
