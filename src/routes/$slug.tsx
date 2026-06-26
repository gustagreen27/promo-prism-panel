import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { trackClick } from "@/lib/track.functions";

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
  | { status: "notfound"; meta?: undefined; url?: undefined; campaignStatus?: undefined }
  | { status: "unavailable"; meta: Meta; campaignStatus: string; url?: undefined }
  | { status: "iframe"; meta: Meta; url: string; campaignStatus?: undefined };

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }): Promise<LoaderData> => {
    const res = await trackClick({ data: { slug: params.slug } });
    if (!res.ok && res.notFound) return { status: "notfound" };
    if (!res.ok) {
      return { status: "unavailable", meta: res.meta, campaignStatus: res.status };
    }
    if (!res.iframeAllowed) {
      throw redirect({ href: res.destination_url });
    }
    return { status: "iframe", meta: res.meta, url: res.destination_url };
  },
  head: ({ loaderData }) => {
    if (!loaderData || loaderData.status === "notfound") {
      return { meta: [{ title: "Campanha não encontrada" }] };
    }
    const m = loaderData.meta;
    const title = m.link_title || m.name || "Campanha";
    const description = m.link_description ?? undefined;
    const ogTitle = m.og_title || title;
    const ogDescription = m.og_description || description;
    const ogImage = m.og_image_url || m.preview_image_url || undefined;
    const ogType = m.og_type || "website";

    const meta: { title?: string; name?: string; property?: string; content?: string }[] = [
      { title },
      { property: "og:title", content: ogTitle },
      { property: "og:type", content: ogType },
    ];
    if (description) meta.push({ name: "description", content: description });
    if (ogDescription) meta.push({ property: "og:description", content: ogDescription });
    if (ogImage) {
      meta.push({ property: "og:image", content: ogImage });
      meta.push({ name: "twitter:image", content: ogImage });
    }

    const links = m.favicon_url ? [{ rel: "icon", href: m.favicon_url }] : [];
    return { meta, links };
  },
  component: CampaignPublicPage,
});

function CampaignPublicPage() {
  const data = Route.useLoaderData();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
        // cross-origin = loaded
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

  return (
    <iframe
      ref={iframeRef}
      src={data.url}
      title={data.meta.link_title || data.meta.name || "Campanha"}
      className="fixed inset-0 h-screen w-screen border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
