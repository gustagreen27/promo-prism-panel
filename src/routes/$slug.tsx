import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
};

type LoaderData =
  | { status: "notfound"; slug: string }
  | { status: "unavailable"; slug: string; meta: Meta; campaignStatus: string }
  | { status: "iframe"; slug: string; meta: Meta; url: string }
  | { status: "redirect"; slug: string; meta: Meta; url: string };

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
    if (!res.iframeAllowed) {
      return { status: "redirect", slug: params.slug, meta: res.meta, url: res.destination_url };
    }
    return { status: "iframe", slug: params.slug, meta: res.meta, url: res.destination_url };
  },
  head: ({ loaderData }) => {
    if (!loaderData || loaderData.status === "notfound") {
      return { meta: [{ title: "Campanha não encontrada" }] };
    }
    const m = loaderData.meta;
    const title = m.og_title || m.link_title || m.name || "Campanha";
    const description = m.og_description || m.link_description || undefined;
    const ogImage = m.og_image_url || m.preview_image_url || undefined;
    const ogType = m.og_type || "website";

    const meta: { title?: string; name?: string; property?: string; content?: string }[] = [
      { title },
      { property: "og:title", content: title },
      { property: "og:type", content: ogType },
    ];
    if (description) {
      meta.push({ name: "description", content: description });
      meta.push({ property: "og:description", content: description });
    }
    if (ogImage) {
      meta.push({ property: "og:image", content: ogImage });
      meta.push({ name: "twitter:image", content: ogImage });
      meta.push({ name: "twitter:card", content: "summary_large_image" });
    }
    const links = m.favicon_url ? [{ rel: "icon", href: m.favicon_url }] : [];
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

  // Client-side watchdog for iframe blocks not caught by server HEAD check
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
        if (doc && (!doc.body || doc.body.children.length === 0)) fallback();
      } catch {
        // cross-origin = loaded ok
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

  if (data.status === "unavailable") {
    const label =
      data.campaignStatus === "draft" ? "ainda não publicada" :
      data.campaignStatus === "paused" ? "pausada" :
      data.campaignStatus === "archived" ? "encerrada" : "indisponível";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-semibold">Campanha {label}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.meta.link_description ?? "Volte mais tarde ou contate o responsável."}
          </p>
        </div>
      </div>
    );
  }

  if (data.status === "redirect") {
    return <RedirectScreen meta={data.meta} url={data.url} />;
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

function RedirectScreen({ meta, url }: { meta: Meta; url: string }) {
  const [secs, setSecs] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s - 1), 1000);
    const t = setTimeout(() => window.location.replace(url), 3000);
    return () => { clearInterval(id); clearTimeout(t); };
  }, [url]);

  const title = meta.og_title || meta.link_title || meta.name || "Continuar para o site";
  const description = meta.og_description || meta.link_description;
  const image = meta.og_image_url || meta.preview_image_url;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-sm">
        {image && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={image} alt="" className="aspect-[1.91/1] w-full object-cover" />
        )}
        <div className="space-y-3 p-6 text-center">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <a
            href={url}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Continuar para o site
          </a>
          <p className="text-xs text-muted-foreground">
            Redirecionando em {Math.max(0, secs)}s...
          </p>
        </div>
      </div>
    </div>
  );
}
