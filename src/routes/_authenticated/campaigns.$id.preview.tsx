import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getCampaign } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ExternalLink, MonitorSmartphone, Smartphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns/$id/preview")({
  head: () => ({ meta: [{ title: "Pré-visualizar campanha" }] }),
  component: PreviewCampaign,
});

type Mode = "iframe" | "redirect";
type Device = "desktop" | "mobile";

function PreviewCampaign() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getCampaign);
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [mode, setMode] = useState<Mode>("iframe");
  const [device, setDevice] = useState<Device>("desktop");
  const [iframeBlocked, setIframeBlocked] = useState(false);

  useEffect(() => {
    setIframeBlocked(false);
  }, [mode, data?.destination_url]);

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  const meta = {
    name: data.name,
    link_title: data.link_title,
    link_description: data.link_description,
    preview_image_url: data.preview_image_url,
    favicon_url: data.favicon_url,
    og_title: data.og_title,
    og_description: data.og_description,
    og_image_url: data.og_image_url,
    og_type: data.og_type,
    link_intent: data.link_intent,
    intermediate_text: data.intermediate_text,
    cta_label: data.cta_label,
  };
  const url = data.destination_url;
  const frameWidth = device === "mobile" ? "w-[390px]" : "w-full";
  const frameHeight = device === "mobile" ? "h-[780px]" : "h-[720px]";

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/campaigns/$id/edit" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar para edição
          </Link>
        </Button>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pré-visualização</h1>
        <p className="text-sm text-muted-foreground">
          Veja exatamente como o público enxergará a campanha antes de publicar — incluindo o fallback caso o iframe seja recusado.
          Nenhum clique é registrado nesta pré-visualização.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="iframe">Modo iframe</TabsTrigger>
            <TabsTrigger value="redirect">Página intermediária</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={device} onValueChange={(v) => setDevice(v as Device)}>
          <TabsList>
            <TabsTrigger value="desktop"><MonitorSmartphone className="mr-1 h-4 w-4" />Desktop</TabsTrigger>
            <TabsTrigger value="mobile"><Smartphone className="mr-1 h-4 w-4" />Mobile</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" asChild>
          <a href={`/${data.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" /> Abrir página pública
          </a>
        </Button>
      </div>

      {iframeBlocked && mode === "iframe" && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Destino bloqueou o iframe</CardTitle>
            <CardDescription>
              Em produção a página pública vai abrir automaticamente a versão de redirecionamento abaixo.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex justify-center rounded-lg border bg-muted/30 p-4">
        <div className={`overflow-hidden rounded-md border bg-background shadow-sm ${frameWidth} ${frameHeight}`}>
          {mode === "iframe" ? (
            <iframe
              key={`${url}-${device}`}
              src={url}
              title={meta.link_title || meta.name || "Pré-visualização"}
              className="h-full w-full border-0"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onError={() => setIframeBlocked(true)}
              onLoad={(e) => {
                const f = e.currentTarget;
                try {
                  const doc = f.contentDocument;
                  if (doc && (!doc.body || doc.body.children.length === 0)) {
                    setIframeBlocked(true);
                  }
                } catch {
                  // cross-origin = carregou normalmente
                }
              }}
            />
          ) : (
            <div className="h-full w-full overflow-auto">
              <RedirectPreview meta={meta} url={url} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RedirectPreview({
  meta,
  url,
}: {
  meta: {
    name: string | null;
    link_title: string | null;
    link_description: string | null;
    preview_image_url: string | null;
    og_title: string | null;
    og_description: string | null;
    og_image_url: string | null;
    link_intent: string | null;
    intermediate_text: string | null;
    cta_label: string | null;
  };
  url: string;
}) {
  const title = meta.og_title || meta.link_title || meta.name || "Continuar para o site";
  const description = meta.og_description || meta.link_description;
  const image = meta.og_image_url || meta.preview_image_url;
  const body = meta.intermediate_text;
  const ctaLabel = meta.cta_label || "Continuar para o site";

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-sm">
        {image && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={image} alt="" className="aspect-[1.91/1] w-full object-cover" referrerPolicy="no-referrer" />
        )}
        <div className="space-y-3 p-6 text-center">
          {meta.link_intent && (
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {meta.link_intent}
            </div>
          )}
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {body && <p className="whitespace-pre-line text-sm text-foreground/90">{body}</p>}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {ctaLabel}
          </a>
          <p className="text-xs text-muted-foreground">
            Pré-visualização — em produção o redirecionamento é automático em 3s.
          </p>
        </div>
      </div>
    </div>
  );
}
