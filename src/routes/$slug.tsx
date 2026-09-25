import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { resolveCampaign, trackEvent } from "@/lib/track.functions";
import { isMetaInAppBrowser, openInExternalBrowser } from "@/lib/external-open";
import { NotFound as GhostNotFound } from "@/components/ui/ghost-404-page";
import { DomainNotFound, useHostZone } from "@/components/domain-guard";

function emitEvent(slug: string, event_type: string, metadata?: Record<string, unknown>) {
  if (!slug) return;
  void trackEvent({ data: { slug, event_type: event_type as never, metadata } }).catch(() => {});
}

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
  loading_image_url?: string | null;
  loading_bg_color?: string | null;
};

function LoadingSplash({ meta }: { meta: Meta }) {
  const raw = meta.loading_bg_color?.trim() ?? "";
  const bg = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : "#C4C7C8";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: bg }}
    >
      {meta.loading_image_url ? (
        <img
          src={meta.loading_image_url}
          alt=""
          className="max-h-[35vh] max-w-[60vw] object-contain sm:max-h-48 sm:max-w-xs"
        />
      ) : (
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
      )}
    </div>
  );
}

type OpenMode = "smart" | "iframe" | "redirect" | "wrapper";

type LoaderData =
  | { status: "notfound"; slug: string }
  | { status: "unavailable"; slug: string; meta: Meta; campaignStatus: string }
  | { status: "iframe"; slug: string; meta: Meta; url: string; mode: OpenMode }
  | { status: "redirect"; slug: string; meta: Meta; url: string; mode: OpenMode }
  | { status: "wrapper"; slug: string; meta: Meta; url: string; mode: OpenMode };

export const Route = createFileRoute("/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({
    w: typeof s.w === "string" ? s.w : undefined,
    wac: typeof s.wac === "string" ? s.wac : undefined,
    r: typeof s.r === "string" ? s.r : undefined,
  }),
  loader: async ({ params, location }): Promise<LoaderData> => {
    const search = location.search as { w?: string; wac?: string; r?: string };
    const res = await resolveCampaign({ data: { slug: params.slug, wa_campaign_id: search.wac ?? search.w, recipient_id: search.r } });
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

function CampaignPublicPage() {
  const data = Route.useLoaderData();
  const hostZone = useHostZone();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [splash, setSplash] = useState(true);

  // Enquanto o destino não carrega, mantemos a tela de carregamento por cima
  // do iframe — assim o visitante nunca vê a página de erro do navegador
  // ("sem conexão") quando o destino recusa o primeiro carregamento.
  useEffect(() => {
    if (data.status !== "iframe") return;
    const t = setTimeout(() => setSplash(false), 6000);
    return () => clearTimeout(t);
  }, [data]);


  // Client-side watchdog for iframe blocks not caught by server HEAD check.
  // Browsers que recusam a conexão (X-Frame-Options, CSP frame-ancestors,
  // ERR_CONNECTION_REFUSED) frequentemente NÃO disparam o evento `load`,
  // então usamos um timeout absoluto como gatilho principal do fallback.
  useEffect(() => {
    if (data.status !== "iframe") return;
    const url = data.url;
    const slug = data.slug;
    let done = false;
    let loaded = false;
    const fallback = (reason: string) => {
      if (done) return;
      done = true;
      emitEvent(slug, "iframe_blocked", { reason });
      emitEvent(slug, "redirect_started", { url, source: "iframe_fallback" });
      window.location.replace(url);
    };
    const checkBlank = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        if (doc && (!doc.body || doc.body.children.length === 0)) fallback("blank_body");
      } catch {
        // cross-origin acessível = carregou normalmente
      }
    };
    const iframe = iframeRef.current;
    const onLoad = () => {
      loaded = true;
      emitEvent(slug, "iframe_loaded", { url });
      setTimeout(checkBlank, 100);
      setTimeout(() => setSplash(false), 350);
    };
    iframe?.addEventListener("load", onLoad);
    iframe?.addEventListener("error", () => fallback("error_event"));
    const tLoad = setTimeout(() => {
      if (!loaded) fallback("load_timeout");
    }, 3500);
    const t1 = setTimeout(checkBlank, 1500);
    const t2 = setTimeout(checkBlank, 4500);
    return () => {
      done = true;
      clearTimeout(tLoad);
      clearTimeout(t1);
      clearTimeout(t2);
      iframe?.removeEventListener("load", onLoad);
    };
  }, [data]);

  if (data.status === "notfound" || (hostZone === "slug" && data.status === "unavailable")) {
    // No domínio de páginas públicas o 404 é neutro (sem marca, sem dados privados).
    if (hostZone === "slug") return <DomainNotFound zone="slug" />;
    return (
      <GhostNotFound
        title="Campanha não encontrada"
        description="Verifique o link ou contate o responsável pela campanha."
      />
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
    return <ImmediateRedirect url={data.url} slug={data.slug} meta={data.meta} />;
  }

  if (data.status === "wrapper") {
    return <WrapperPage data={data} />;
  }

  return (
    <>
      <iframe
        ref={iframeRef}
        src={data.url}
        title={data.meta.og_title || data.meta.link_title || data.meta.name || "Campanha"}
        className="fixed inset-0 h-screen w-screen border-0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="no-referrer-when-downgrade"
      />
      {splash && <LoadingSplash meta={data.meta} />}
    </>
  );
}

function WrapperPage({
  data,
}: {
  data: Extract<LoaderData, { status: "wrapper" }>;
}) {
  // Dentro do navegador interno do Facebook/Instagram, tentamos sair
  // automaticamente para o navegador padrão do aparelho.
  useEffect(() => {
    if (!isMetaInAppBrowser()) return;
    const t = setTimeout(() => {
      emitEvent(data.slug, "cta_clicked", { url: data.url, source: "auto_external_browser" });
      openInExternalBrowser(data.url);
    }, 600);
    return () => clearTimeout(t);
  }, [data.slug, data.url]);

  const m = data.meta;
  const heading = m.og_title || m.link_title || m.name || "Continuar";
  const description = m.intermediate_text || m.link_description || m.og_description;
  const cta = m.cta_label || "Continuar";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-xl border bg-card text-center shadow-sm">
        {m.preview_image_url && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={m.preview_image_url} alt="" className="aspect-[1.91/1] w-full object-cover" />
        )}
        <div className="space-y-4 p-6">
          {m.link_intent && (
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {m.link_intent}
            </div>
          )}
          <h1 className="text-2xl font-semibold">{heading}</h1>
          {description && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{description}</p>
          )}
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              emitEvent(data.slug, "cta_clicked", { url: data.url });
              if (isMetaInAppBrowser()) {
                e.preventDefault();
                openInExternalBrowser(data.url);
              }
            }}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
          >
            {cta}
          </a>
        </div>
      </div>
    </div>
  );
}

function ImmediateRedirect({ url, slug, meta }: { url: string; slug: string; meta: Meta }) {
  useEffect(() => {
    emitEvent(slug, "redirect_started", { url, source: "direct" });
    // Mantém a splash (logo da campanha) visível por um instante antes de
    // sair da página — sem isso o navegador troca de página antes do primeiro
    // paint e o visitante só vê tela branca / "sem conexão".
    // Sem espera artificial: só o tempo mínimo para o primeiro paint.
    const hold = 50;
    const inApp = isMetaInAppBrowser();
    const go = setTimeout(() => {
      if (inApp) {
        openInExternalBrowser(url);
      } else {
        window.location.replace(url);
      }
      emitEvent(slug, "redirect_completed", { url });
    }, hold);
    // Alguns navegadores in-app ignoram o replace; reforça o destino.
    const t = setTimeout(() => {
      window.location.href = url;
    }, hold + (inApp ? 1800 : 600));
    return () => {
      clearTimeout(go);
      clearTimeout(t);
    };
  }, [url, slug]);
  return <LoadingSplash meta={meta} />;
}

