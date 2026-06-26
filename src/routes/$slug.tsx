import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { trackClick } from "@/lib/track.functions";

export const Route = createFileRoute("/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "Carregando..." }] }),
  component: CampaignPublicPage,
});

function CampaignPublicPage() {
  const { slug } = Route.useParams();
  const track = useServerFn(trackClick);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "notfound" }
    | { status: "iframe"; url: string }
    | { status: "redirect"; url: string }
  >({ status: "loading" });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await track({ data: { slug } });
        if (!mounted) return;
        if (!res.ok) {
          setState({ status: "notfound" });
          return;
        }
        if (res.iframeAllowed) {
          setState({ status: "iframe", url: res.destination_url });
        } else {
          setState({ status: "redirect", url: res.destination_url });
          window.location.replace(res.destination_url);
        }
      } catch {
        if (mounted) setState({ status: "notfound" });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug, track]);

  // Iframe load watchdog: if blocked/blank, fall back to redirect
  useEffect(() => {
    if (state.status !== "iframe") return;
    let done = false;
    const fallback = () => {
      if (done) return;
      done = true;
      window.location.replace(state.url);
    };
    const check = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        // If we can read the doc same-origin, it means the remote didn't load
        // (browser kept about:blank due to X-Frame-Options/CSP) → redirect.
        if (doc && (!doc.body || doc.body.children.length === 0)) {
          fallback();
        }
      } catch {
        // cross-origin access denied = iframe actually loaded the remote page
      }
    };
    const onLoad = () => setTimeout(check, 100);
    const iframe = iframeRef.current;
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
  }, [state]);

  if (state.status === "loading" || state.status === "redirect") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (state.status === "notfound") {
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
      src={state.url}
      title="Campanha"
      className="fixed inset-0 h-screen w-screen border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
