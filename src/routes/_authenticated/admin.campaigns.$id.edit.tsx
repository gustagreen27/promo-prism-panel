import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  analyzeCampaignIntent,
  checkSlugAvailability,
  getCampaign,
  recheckIframeCompatibility,
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
import { RiskMeter, SocialPreviews } from "@/components/social-previews";
import { ArrowLeft, Sparkles, CheckCircle2, AlertTriangle, XCircle, Wand2, Eye } from "lucide-react";
import { toast } from "sonner";
import { applyIntentPreset, getIntentPreset, PRESET_TARGET_FIELDS } from "@/lib/intent-presets";
import { validateCampaignForm, type FieldIssue } from "@/lib/campaign-validation";
import { CAMPAIGN_TYPES, LINK_INTENTS, OPEN_MODES, PAGE_CATEGORIES } from "@/lib/campaign-options";
import { ImageUpload } from "@/components/image-upload";

export const Route = createFileRoute("/_authenticated/admin/campaigns/$id/edit")({
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
  const checkSlugFn = useServerFn(checkSlugAvailability);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Participant[]>([]);
  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      slug: data.slug ?? "",
      destination_url: data.destination_url ?? "",
      category: data.category ?? "",
      campaign_type: data.campaign_type ?? "",
      link_intent: data.link_intent ?? "",
      page_category: data.page_category ?? "",
      link_title: data.link_title ?? "",
      link_description: data.link_description ?? "",
      intermediate_text: data.intermediate_text ?? "",
      cta_label: data.cta_label ?? "",
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
      open_mode: (data as Record<string, unknown>).open_mode as string ?? "smart",
    });
    setParticipants(((data as any).participants ?? []) as Participant[]);
  }, [data]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Auto-aplica preset da intenção apenas em campos ainda vazios.
  const onIntentChange = (intent: string) => {
    setForm((f) => {
      const base = { ...f, link_intent: intent };
      const { next, changed } = applyIntentPreset(base, intent, false);
      if (changed.length) {
        toast.info("Preset da intenção aplicado nos campos vazios.", {
          description: `Campos preenchidos: ${changed.join(", ")}`,
        });
      }
      return next;
    });
  };

  // Reaplica o preset por cima dos valores atuais (sobrescreve).
  const reapplyIntentPreset = () => {
    const intent = (form.link_intent ?? "").trim();
    if (!intent) {
      toast.error("Escolha uma intenção antes de reaplicar.");
      return;
    }
    if (!getIntentPreset(intent)) {
      toast.error("Não há preset disponível para essa intenção.");
      return;
    }
    const confirmed = window.confirm(
      `Isso vai sobrescrever os campos ${PRESET_TARGET_FIELDS.join(", ")} com o preset da intenção "${intent}". Continuar?`,
    );
    if (!confirmed) return;
    setForm((f) => applyIntentPreset(f, intent, true).next);
    toast.success("Preset da intenção reaplicado.");
  };

  const validation = validateCampaignForm(form, form.status ?? "draft");
  const firstErrorOf = (field: string): string | undefined =>
    validation.errorsByField[field]?.[0]?.message;
  const firstWarningOf = (field: string): string | undefined =>
    validation.warningsByField[field]?.[0]?.message;

  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const [slugStatus, setSlugStatus] = useState<
    { state: "idle" | "checking" | "ok" | "invalid" | "taken"; message?: string }
  >({ state: "idle" });
  useEffect(() => {
    const current = (form.slug ?? "").trim();
    if (!current) { setSlugStatus({ state: "invalid", message: "Informe um slug." }); return; }
    if (!SLUG_RE.test(current)) {
      setSlugStatus({ state: "invalid", message: "Use apenas letras minúsculas, números e hífens (kebab-case)." });
      return;
    }
    if (current === (data?.slug ?? "")) { setSlugStatus({ state: "ok", message: "Slug atual." }); return; }
    setSlugStatus({ state: "checking" });
    const t = setTimeout(async () => {
      try {
        const r = await checkSlugFn({ data: { slug: current, excludeId: id } });
        if (r.available) setSlugStatus({ state: "ok", message: "Disponível." });
        else if (r.reason === "taken") setSlugStatus({ state: "taken", message: "Slug já está em uso." });
        else setSlugStatus({ state: "invalid", message: "Formato inválido." });
      } catch {
        setSlugStatus({ state: "idle" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.slug, data?.slug, id, checkSlugFn]);
  const slugBlocking = slugStatus.state === "invalid" || slugStatus.state === "taken" || slugStatus.state === "checking";

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id,
          name: form.name,
          slug: form.slug,
          destination_url: form.destination_url,
          category: form.category || null,
          campaign_type: form.campaign_type || null,
          link_intent: form.link_intent || null,
          page_category: form.page_category || null,
          link_title: form.link_title || null,
          link_description: form.link_description || null,
          intermediate_text: form.intermediate_text || null,
          cta_label: form.cta_label || null,
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
          open_mode: (form.open_mode as "smart" | "iframe" | "redirect" | "wrapper") || "smart",
          participants,
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
          <Link to="/admin">
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
          <Field
            label="Slug (URL pública)"
            id="slug"
            hint={
              slugStatus.message
                ? `${slugStatus.message} Ex.: /${form.slug || "..."}`
                : `Apenas letras minúsculas, números e hífens. Ex.: /${form.slug || "..."}`
            }
            hintTone={
              slugStatus.state === "ok" ? "ok"
              : slugStatus.state === "checking" ? "muted"
              : slugStatus.state === "idle" ? "muted"
              : "error"
            }
          >
            <Input
              id="slug"
              value={form.slug ?? ""}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
              aria-invalid={slugStatus.state === "invalid" || slugStatus.state === "taken"}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoria da campanha" id="category">
              <Select value={form.category || ""} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id="category"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de campanha" id="campaign_type">
              <Select value={form.campaign_type || ""} onValueChange={(v) => set("campaign_type", v)}>
                <SelectTrigger id="campaign_type"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Intenção do link"
              id="link_intent"
              hint="Define o tom da página intermediária e dos previews. Ao escolher, campos vazios são preenchidos com um preset adequado."
            >
              <div className="flex gap-2">
                <Select value={form.link_intent || ""} onValueChange={onIntentChange}>
                  <SelectTrigger id="link_intent"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {LINK_INTENTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Reaplicar preset da intenção (sobrescreve título, descrição, texto intermediário, CTA e OG)"
                  onClick={reapplyIntentPreset}
                  disabled={!form.link_intent}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <Field label="Categoria da página de destino" id="page_category">
              <Select value={form.page_category || ""} onValueChange={(v) => set("page_category", v)}>
                <SelectTrigger id="page_category"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {PAGE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Modo de abertura"
              id="open_mode"
              hint={
                OPEN_MODES.find((m) => m.value === (form.open_mode ?? "smart"))?.description
              }
            >
              <Select
                value={form.open_mode || "smart"}
                onValueChange={(v) => set("open_mode", v)}
              >
                <SelectTrigger id="open_mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPEN_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <IframeCompatStatus
                campaign={data as { iframe_compatible: boolean | null; iframe_checked_at: string | null }}
                onRecheck={() => refetch()}
                id={id}
              />
            </Field>
          </div>
          <Field
            label="Título do link"
            id="link_title"
            hint="Aparece como título da página wrapper e nos previews."
            error={firstErrorOf("link_title")}
            warning={firstWarningOf("link_title")}
          >
            <Input id="link_title" value={form.link_title ?? ""} onChange={(e) => set("link_title", e.target.value)} />
          </Field>
          <Field label="Descrição do link" id="link_description">
            <Textarea id="link_description" rows={3} value={form.link_description ?? ""} onChange={(e) => set("link_description", e.target.value)} />
          </Field>
          <Field
            label="Texto principal da página intermediária"
            id="intermediate_text"
            hint="Mensagem exibida na página wrapper quando o destino não permitir iframe. Use para reforçar a intenção do link."
            error={firstErrorOf("intermediate_text")}
            warning={firstWarningOf("intermediate_text")}
          >
            <Textarea
              id="intermediate_text"
              rows={4}
              value={form.intermediate_text ?? ""}
              onChange={(e) => set("intermediate_text", e.target.value)}
              placeholder="Ex.: Sua aula confirmada começa em instantes — clique para entrar."
            />
          </Field>
          <Field
            label="Texto do botão de ação"
            id="cta_label"
            hint="Padrão: “Continuar para o site”."
            error={firstErrorOf("cta_label")}
            warning={firstWarningOf("cta_label")}
          >
            <Input
              id="cta_label"
              value={form.cta_label ?? ""}
              onChange={(e) => set("cta_label", e.target.value)}
              placeholder="Entrar na aula"
            />
          </Field>
        </TabsContent>

        <TabsContent value="urls" className="space-y-4 pt-4">
          <Field
            label="URL final de destino"
            id="destination_url"
            error={firstErrorOf("destination_url")}
            warning={firstWarningOf("destination_url")}
          >
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
            <Field label="Imagem de preview" id="preview_image_url" hint="PNG/JPG/WebP até 4MB ou cole uma URL">
              <ImageUpload
                value={form.preview_image_url}
                onChange={(v) => set("preview_image_url", v)}
                folder="preview"
              />
            </Field>
            <Field label="Favicon" id="favicon_url" hint="ICO/PNG/SVG até 1MB">
              <ImageUpload
                value={form.favicon_url}
                onChange={(v) => set("favicon_url", v)}
                folder="favicon"
                shape="square"
                maxMb={1}
                accept="image/x-icon,image/png,image/svg+xml"
              />
            </Field>
          </div>
          <Field label="og:title" id="og_title"><Input id="og_title" value={form.og_title ?? ""} onChange={(e) => set("og_title", e.target.value)} /></Field>
          <Field label="og:description" id="og_description">
            <Textarea id="og_description" rows={3} value={form.og_description ?? ""} onChange={(e) => set("og_description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="og:image" id="og_image_url" hint="Recomendado 1200x630">
              <ImageUpload
                value={form.og_image_url}
                onChange={(v) => set("og_image_url", v)}
                folder="og"
              />
            </Field>
            <Field label="og:type" id="og_type" hint="Padrão: website">
              <Input id="og_type" value={form.og_type ?? ""} onChange={(e) => set("og_type", e.target.value)} placeholder="website" />
            </Field>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pré-visualização social</CardTitle>
              <CardDescription>
                Mudanças no preview podem demorar a aparecer em redes sociais por causa de cache —
                forçe uma re-leitura no debugger do Facebook/LinkedIn se necessário.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SocialPreviews
                meta={{
                  link_title: form.link_title,
                  link_description: form.link_description,
                  og_title: form.og_title,
                  og_description: form.og_description,
                  og_image_url: form.og_image_url,
                  preview_image_url: form.preview_image_url,
                  favicon_url: form.favicon_url,
                }}
                publicUrl={publicUrl}
              />
            </CardContent>
          </Card>
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
          <div className="flex items-start justify-between gap-4">
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

          <Card>
            <CardContent className="pt-6">
              <RiskMeter score={report?.score ?? data.intent_score} />
            </CardContent>
          </Card>

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

      {validation.issues.length > 0 && (
        <Card className={validation.hasBlockingErrors ? "border-rose-300" : "border-amber-300"}>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              {validation.hasBlockingErrors ? (
                <>
                  <XCircle className="h-4 w-4 text-rose-600" />
                  Resolva os campos obrigatórios antes de salvar
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Avisos antes de publicar
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <ul className="space-y-1 text-sm">
              {validation.issues.map((i, idx) => (
                <li
                  key={`${i.field}-${idx}`}
                  className={i.level === "error" ? "text-rose-600" : "text-amber-700 dark:text-amber-400"}
                >
                  <span className="font-medium">{i.field}:</span> {i.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/campaigns/$id/preview" params={{ id }}>
              <Eye className="mr-1 h-4 w-4" /> Pré-visualizar
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/campaigns/$id" params={{ id }}>Ver métricas</Link>
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || slugBlocking || validation.hasBlockingErrors}
            title={
              validation.hasBlockingErrors
                ? "Resolva os erros listados acima antes de salvar."
                : undefined
            }
          >
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
  hintTone = "muted",
  error,
  warning,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  hintTone?: "muted" | "ok" | "error";
  error?: string;
  warning?: string;
  children: React.ReactNode;
}) {
  const toneClass =
    hintTone === "ok" ? "text-emerald-600"
    : hintTone === "error" ? "text-rose-600"
    : "text-muted-foreground";
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="flex items-start gap-1 text-xs text-rose-600">
          <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {!error && warning && (
        <p className="flex items-start gap-1 text-xs text-amber-600">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{warning}</span>
        </p>
      )}
      {hint && <p className={`text-xs ${toneClass}`}>{hint}</p>}
    </div>
  );
}


function IframeCompatStatus({
  campaign,
  id,
  onRecheck,
}: {
  campaign: { iframe_compatible: boolean | null; iframe_checked_at: string | null } | null | undefined;
  id: string;
  onRecheck: () => void;
}) {
  const recheckFn = useServerFn(recheckIframeCompatibility);
  const [busy, setBusy] = useState(false);
  const compat = campaign?.iframe_compatible;
  const checkedAt = campaign?.iframe_checked_at;
  const statusText =
    compat == null
      ? "Ainda não verificado"
      : compat
        ? "Destino permite iframe"
        : "Destino bloqueia iframe — modo inteligente vai redirecionar";
  const tone =
    compat == null ? "text-muted-foreground" : compat ? "text-emerald-600" : "text-amber-600";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
      <span className={tone}>{statusText}</span>
      {checkedAt && (
        <span className="text-muted-foreground">
          verificado em {new Date(checkedAt).toLocaleString()}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await recheckFn({ data: { id } });
            toast.success("Compatibilidade re-verificada");
            onRecheck();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao re-verificar");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Verificando..." : "Re-checar"}
      </Button>
    </div>
  );
}
