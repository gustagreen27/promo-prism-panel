import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  analyzeCampaignIntent,
  getCampaign,
  updateCampaign,
} from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntentScoreBadge, StatusBadge } from "@/components/campaign-badges";
import { ArrowLeft, Sparkles, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/campaigns/$id/edit")({
  head: () => ({ meta: [{ title: "Editar campanha" }] }),
  component: EditCampaign,
});

const CATEGORIES = [
  "Vendas",
  "Evento",
  "Captação de leads",
  "Comunicado",
  "Promoção",
  "Conteúdo",
  "Outro",
];
const STATUSES = [
  { value: "draft", label: "Rascunho" },
  { value: "active", label: "Ativa" },
  { value: "paused", label: "Pausada" },
  { value: "archived", label: "Arquivada" },
];

function EditCampaign() {
  const { id } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getCampaign);
  const updateFn = useServerFn(updateCampaign);
  const analyzeFn = useServerFn(analyzeCampaignIntent);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      slug: data.slug ?? "",
      destination_url: data.destination_url ?? "",
      category: data.category ?? "",
      link_title: data.link_title ?? "",
      link_description: data.link_description ?? "",
      preview_image_url: data.preview_image_url ?? "",
      favicon_url: data.favicon_url ?? "",
      og_title: data.og_title ?? "",
      og_description: data.og_description ?? "",
      og_image_url: data.og_image_url ?? "",
      og_type: data.og_type ?? "",
      utm_source: data.utm_source ?? "",
      utm_medium: data.utm_medium ?? "",
      utm_campaign: data.utm_campaign ?? "",
      utm_term: data.utm_term ?? "",
      utm_content: data.utm_content ?? "",
      status: data.status ?? "draft",
    });
  }, [data]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id,
          name: form.name,
          slug: form.slug,
          destination_url: form.destination_url,
          category: form.category || null,
          link_title: form.link_title || null,
          link_description: form.link_description || null,
          preview_image_url: form.preview_image_url || null,
          favicon_url: form.favicon_url || null,
          og_title: form.og_title || null,
          og_description: form.og_description || null,
          og_image_url: form.og_image_url || null,
          og_type: form.og_type || null,
          utm_source: form.utm_source || null,
          utm_medium: form.utm_medium || null,
          utm_campaign: form.utm_campaign || null,
          utm_term: form.utm_term || null,
          utm_content: form.utm_content || null,
          status: (form.status as "draft" | "active" | "paused" | "archived") || "draft",
        } as never,
      }),
    onSuccess: () => {
      toast.success("Campanha salva");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      router.invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Análise concluída");
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na análise"),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  const publicUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${data.slug}` : `/${data.slug}`;

  const report = (data.intent_report as { score: number; summary: string; checks: { name: string; status: "ok" | "warn" | "fail"; detail: string }[] } | null) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          <StatusBadge status={data.status} />
          <IntentScoreBadge score={data.intent_score} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground break-all">
          <a href={`/${data.slug}`} target="_blank" rel="noreferrer" className="hover:underline">
            {publicUrl}
          </a>
        </p>
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="identity">Identificação</TabsTrigger>
          <TabsTrigger value="urls">URLs &amp; UTMs</TabsTrigger>
          <TabsTrigger value="preview">Preview / OG</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="intent">Análise de intenção</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-4 pt-4">
          <Field label="Nome da campanha" id="name">
            <Input id="name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Slug (URL pública)" id="slug" hint={`Ex.: /${form.slug || "..."}`}>
            <Input id="slug" value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} />
          </Field>
          <Field label="Categoria / intenção" id="category">
            <Select value={form.category || ""} onValueChange={(v) => set("category", v)}>
              <SelectTrigger id="category"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Título do link" id="link_title" hint="Aparece como título da página wrapper e nos previews.">
            <Input id="link_title" value={form.link_title ?? ""} onChange={(e) => set("link_title", e.target.value)} />
          </Field>
          <Field label="Descrição do link" id="link_description">
            <Textarea id="link_description" rows={3} value={form.link_description ?? ""} onChange={(e) => set("link_description", e.target.value)} />
          </Field>
        </TabsContent>

        <TabsContent value="urls" className="space-y-4 pt-4">
          <Field label="URL final de destino" id="destination_url">
            <Input id="destination_url" type="url" value={form.destination_url ?? ""} onChange={(e) => set("destination_url", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="utm_source" id="utm_source"><Input id="utm_source" value={form.utm_source ?? ""} onChange={(e) => set("utm_source", e.target.value)} /></Field>
            <Field label="utm_medium" id="utm_medium"><Input id="utm_medium" value={form.utm_medium ?? ""} onChange={(e) => set("utm_medium", e.target.value)} /></Field>
            <Field label="utm_campaign" id="utm_campaign"><Input id="utm_campaign" value={form.utm_campaign ?? ""} onChange={(e) => set("utm_campaign", e.target.value)} /></Field>
            <Field label="utm_term" id="utm_term"><Input id="utm_term" value={form.utm_term ?? ""} onChange={(e) => set("utm_term", e.target.value)} /></Field>
            <Field label="utm_content" id="utm_content"><Input id="utm_content" value={form.utm_content ?? ""} onChange={(e) => set("utm_content", e.target.value)} /></Field>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Imagem de preview" id="preview_image_url" hint="URL pública (https)">
              <Input id="preview_image_url" type="url" value={form.preview_image_url ?? ""} onChange={(e) => set("preview_image_url", e.target.value)} />
            </Field>
            <Field label="Favicon" id="favicon_url">
              <Input id="favicon_url" type="url" value={form.favicon_url ?? ""} onChange={(e) => set("favicon_url", e.target.value)} />
            </Field>
          </div>
          <Field label="og:title" id="og_title"><Input id="og_title" value={form.og_title ?? ""} onChange={(e) => set("og_title", e.target.value)} /></Field>
          <Field label="og:description" id="og_description">
            <Textarea id="og_description" rows={3} value={form.og_description ?? ""} onChange={(e) => set("og_description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="og:image" id="og_image_url"><Input id="og_image_url" type="url" value={form.og_image_url ?? ""} onChange={(e) => set("og_image_url", e.target.value)} /></Field>
            <Field label="og:type" id="og_type" hint="Padrão: website">
              <Input id="og_type" value={form.og_type ?? ""} onChange={(e) => set("og_type", e.target.value)} placeholder="website" />
            </Field>
          </div>

          {(form.preview_image_url || form.og_image_url) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Pré-visualização</CardTitle></CardHeader>
              <CardContent>
                <img
                  src={form.og_image_url || form.preview_image_url}
                  alt="Preview"
                  className="max-h-64 rounded border object-cover"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="status" className="space-y-4 pt-4">
          <Field label="Status da campanha" id="status" hint="Apenas campanhas ativas registram cliques e carregam o destino.">
            <Select value={form.status || "draft"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </TabsContent>

        <TabsContent value="intent" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Análise de intenção</h2>
              <p className="text-sm text-muted-foreground">
                Verifica coerência entre título, descrição, destino e categoria, além de riscos.
              </p>
            </div>
            <Button onClick={() => analyze.mutate()} disabled={analyze.isPending}>
              <Sparkles className="mr-1 h-4 w-4" />
              {analyze.isPending ? "Analisando..." : report ? "Reexecutar análise" : "Analisar agora"}
            </Button>
          </div>

          {!report && (
            <Card><CardContent className="py-6 text-sm text-muted-foreground">Nenhuma análise executada ainda.</CardContent></Card>
          )}

          {report && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Pontuação: {report.score}/100 <IntentScoreBadge score={report.score} />
                </CardTitle>
                <CardDescription>{report.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.checks.map((ck, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-md border p-3">
                    {ck.status === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />}
                    {ck.status === "warn" && <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
                    {ck.status === "fail" && <XCircle className="mt-0.5 h-4 w-4 text-rose-600" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{ck.name}</div>
                      <div className="text-sm text-muted-foreground">{ck.detail}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/campaigns/$id" params={{ id }}>Ver métricas</Link>
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
