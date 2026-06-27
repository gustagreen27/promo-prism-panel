import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { resolveCampaign, trackClick } from "@/lib/track.functions";

type Meta = {
  name: string | null;
  link_title: string | null;
  link_description: string | null;
  preview_image_url: string | null;
  favicon_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  og_type: string | null;
  link_intent: string | null;
  campaign_type: string | null;
  page_category: string | null;
  intermediate_text: string | null;
  cta_label: string | null;
};

type OpenMode = "smart" | "iframe" | "redirect" | "wrapper";

type LoaderData =
  | { status: "notfound"; slug: string }
  | { status: "unavailable"; slug: string; meta: Meta; campaignStatus: string }
  | { status: "iframe"; slug: string; meta: Meta; url: string; mode: OpenMode }
  | { status: "redirect"; slug: string; meta: Meta; url: string; mode: OpenMode }
  | { status: "wrapper"; slug: string; meta: Meta; url: string; mode: OpenMode };

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }): Promise<LoaderData> => {
    const res = await resolveCampaign({ data: { slug: params.slug } });
    if (!res.ok && "notFound" in res && res.notFound) {
      return { status: "notfound", slug: params.slug };
    }
    if (!res.ok) {
      return {
        status: "unavailable",
        slug: params.slug,
        meta: (res as { meta: Meta }).meta,
        campaignStatus: (res as { status: string }).status,
      };
    }
    const mode = res.open_mode;
    if (mode === "wrapper") {
      return { status: "wrapper", slug: params.slug, meta: res.meta, url: res.destination_url, mode };
    }
    if (mode === "redirect" || !res.iframeAllowed) {
      return { status: "redirect", slug: params.slug, meta: res.meta, url: res.destination_url, mode };
    }
    return { status: "iframe", slug: params.slug, meta: res.meta, url: res.destination_url, mode };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData || loaderData.status === "notfound") {
      return {
        meta: [
          { title: "Campanha não encontrada" },
          { name: "robots", content: "noindex,nofollow" },
        ],
      };
    }
    const m = loaderData.meta;
    const title = m.og_title || m.link_title || m.name || "Campanha";
    const description = m.og_description || m.link_description || undefined;
    const ogImage = m.og_image_url || m.preview_image_url || undefined;
    const ogType = m.og_type || "website";
    const pageUrl = `https://digitalfr.lovable.app/${params.slug}`;
    const twitterCard = ogImage ? "summary_large_image" : "summary";

    const meta: { title?: string; name?: string; property?: string; content?: string }[] = [
      { title },
      { property: "og:title", content: title },
      { property: "og:type", content: ogType },
      { property: "og:url", content: pageUrl },
      { name: "twitter:card", content: twitterCard },
      { name: "twitter:title", content: title },
      // Campanhas são links de tráfego — não devem ser indexadas.
      { name: "robots", content: "noindex,nofollow" },
    ];
    if (description) {
      meta.push({ name: "description", content: description });
      meta.push({ property: "og:description", content: description });
      meta.push({ name: "twitter:description", content: description });
    }
    if (ogImage) {
      meta.push({ property: "og:image", content: ogImage });
      meta.push({ property: "og:image:alt", content: title });
      meta.push({ name: "twitter:image", content: ogImage });
    }
    if (m.page_category) {
      meta.push({ property: "article:section", content: m.page_category });
    }
    if (m.link_intent) {
      meta.push({ property: "article:tag", content: m.link_intent });
    }
    if (m.campaign_type) {
      meta.push({ name: "category", content: m.campaign_type });
    }

    const links: { rel: string; href: string; type?: string; sizes?: string }[] = [
      { rel: "canonical", href: pageUrl },
    ];
    if (m.favicon_url) {
      links.push({ rel: "icon", href: m.favicon_url });
      links.push({ rel: "shortcut icon", href: m.favicon_url });
      links.push({ rel: "apple-touch-icon", href: m.favicon_url });
    }
    return { meta, links };
  },

  component: CampaignPublicPage,
});

function useFireAndForgetTracking(slug: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    // fire-and-forget — never block UI on IP-API / insert
    void trackClick({ data: { slug } }).catch(() => {});
  }, [slug, enabled]);
}

function CampaignPublicPage() {
  const data = Route.useLoaderData();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const trackingEnabled =
    data.status === "iframe" || data.status === "redirect";
  useFireAndForgetTracking(data.status === "notfound" ? "" : data.slug, trackingEnabled);

  // Client-side watchdog for iframe blocks not caught by server HEAD check.
  // Browsers que recusam a conexão (X-Frame-Options, CSP frame-ancestors,
  // ERR_CONNECTION_REFUSED) frequentemente NÃO disparam o evento `load`,
  // então usamos um timeout absoluto como gatilho principal do fallback.
  useEffect(() => {
    if (data.status !== "iframe") return;
    const url = data.url;
    let done = false;
    let loaded = false;
    const fallback = () => {
      if (done) return;
      done = true;
      window.location.replace(url);
    };
    const checkBlank = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        if (doc && (!doc.body || doc.body.children.length === 0)) fallback();
      } catch {
        // cross-origin acessível = carregou normalmente
      }
    };
    const iframe = iframeRef.current;
    const onLoad = () => {
      loaded = true;
      setTimeout(checkBlank, 100);
    };
    iframe?.addEventListener("load", onLoad);
    iframe?.addEventListener("error", fallback);
    // Se o load nunca disparou em 3.5s, assumimos bloqueio e redirecionamos.
    const tLoad = setTimeout(() => {
      if (!loaded) fallback();
    }, 3500);
    const t1 = setTimeout(checkBlank, 1500);
    const t2 = setTimeout(checkBlank, 4500);
    return () => {
      done = true;
      clearTimeout(tLoad);
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

  if (data.status === "unavailable") {
    const label =
      data.campaignStatus === "draft" ? "ainda não publicada" :
      data.campaignStatus === "paused" ? "pausada" :
      data.campaignStatus === "archived" ? "encerrada" : "indisponível";
    const m = data.meta;
    const heading = m.link_title || m.name || `Campanha ${label}`;
    const description = m.link_description || "Volte mais tarde ou contate o responsável.";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md overflow-hidden rounded-xl border bg-card text-center shadow-sm">
          {m.preview_image_url && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={m.preview_image_url} alt="" className="aspect-[1.91/1] w-full object-cover" />
          )}
          <div className="space-y-3 p-6">
            {m.link_intent && (
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {m.link_intent}
              </div>
            )}
            <h1 className="text-2xl font-semibold">{heading}</h1>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Campanha {label}
            </p>
            <p className="text-sm text-muted-foreground">{description}</p>
            {m.page_category && (
              <p className="text-xs text-muted-foreground">Categoria: {m.page_category}</p>
            )}
          </div>
        </div>
      </div>
    );
  }


  if (data.status === "redirect") {
    return <ImmediateRedirect url={data.url} />;
  }

  return (
    <iframe
      ref={iframeRef}
      src={data.url}
      title={data.meta.og_title || data.meta.link_title || data.meta.name || "Campanha"}
      className="fixed inset-0 h-screen w-screen border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

function ImmediateRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);
  // SSR fallback: meta refresh garante redirecionamento mesmo sem JS.
  return <meta httpEquiv="refresh" content={`0;url=${url}`} />;
}

