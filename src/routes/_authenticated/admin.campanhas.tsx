import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign,
} from "@/lib/campaigns.functions";
import { applyIntentPreset } from "@/lib/intent-presets";
import { CAMPAIGN_TYPES, LINK_INTENTS, OPEN_MODES, PAGE_CATEGORIES } from "@/lib/campaign-options";
import { slugify } from "@/lib/slugify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ErrorCard } from "@/components/admin/query-state";
import { Copy, ExternalLink, Trash2, BarChart3, Pencil, Play, Pause, Info, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IntentScoreBadge, StatusBadge } from "@/components/campaign-badges";
import {
  ParticipantsBadges,
  ParticipantsSelect,
  ParticipantsFilter,
  matchesParticipants,
  type Participant,
} from "@/components/participants";

export const Route = createFileRoute("/_authenticated/admin/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Painel" }] }),
  component: CampaignsList,
});

function CampaignsList() {
  const list = useServerFn(listCampaigns);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => list(),
  });

  const [partFilter, setPartFilter] = useState<Participant[]>([]);
  const filtered = (data ?? []).filter((c: any) => matchesParticipants(c, partFilter));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Crie campanhas, gere URLs e acompanhe acessos.
          </p>
        </div>
        <NewCampaignDialog onCreated={() => refetch()} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filtrar por sócio:</span>
        <div className="w-56"><ParticipantsFilter value={partFilter} onChange={setPartFilter} /></div>
        {partFilter.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setPartFilter([])}>Limpar</Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : error ? (
        <ErrorCard error={error} onRetry={() => refetch()} />
      ) : !filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma campanha encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((c: any) => (
            <CampaignRow key={c.id} c={c} onChange={() => refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignRow({
  c,
  onChange,
}: {
  c: Awaited<ReturnType<typeof listCampaigns>>[number];
  onChange: () => void;
}) {
  const del = useServerFn(deleteCampaign);
  const update = useServerFn(updateCampaign);
  const isActive = c.status === "active";
  const publicUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${c.slug}` : `/${c.slug}`;

    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4 border-b bg-muted/30">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{c.name}</CardTitle>
            <StatusBadge status={c.status} />
            <IntentScoreBadge score={c.intent_score} />
            <ParticipantsBadges value={(c as any).participants} empty="" />
            {c.category && (
              <span className="text-xs text-muted-foreground">{c.category}</span>
            )}
          </div>
          <CardDescription className="break-all">
            <a href={`/${c.slug}`} target="_blank" rel="noreferrer" className="hover:underline">
              {publicUrl}
            </a>
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        <h3 className="text-[15px] font-semibold text-foreground/90 pb-3 border-b">
          Resumo das estimativas
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetaStat label="Cliques totais" value={c.total_clicks} />
          <MetaStat label="Cliques únicos" value={c.unique_clicks} />
          <MetaStat label="Status" value={isActive ? "Ativa" : c.status === "paused" ? "Pausada" : "Rascunho"} />
          <MetaStat label="Destino" value={c.destination_url} truncate />
        </div>
      </CardContent>

      <div className="border-t bg-muted/20 px-4 py-2 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-primary hover:text-primary hover:bg-primary/10 font-semibold tracking-wide text-xs uppercase"
        >
          <Link to="/admin/campaigns/$id/edit" params={{ id: c.id }}>
            <Pencil className="mr-1 h-4 w-4" /> Editar campanha
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary font-semibold tracking-wide text-xs uppercase"
            onClick={async () => {
              try {
                await update({ data: { id: c.id, status: isActive ? "paused" : "active" } });
                toast.success(isActive ? "Campanha pausada" : "Campanha publicada");
                onChange();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao atualizar status");
              }
            }}
          >
            {isActive ? (<><Pause className="mr-1 h-4 w-4" /> Pausar</>) : (<><Play className="mr-1 h-4 w-4" /> Publicar</>)}
          </Button>

          <Button
            size="sm"
            asChild
            className="font-semibold tracking-wide text-xs uppercase"
          >
            <Link to="/admin/campaigns/$id" params={{ id: c.id }}>
              <BarChart3 className="mr-1 h-4 w-4" /> Visualizar estatísticas
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl);
                  toast.success("URL copiada");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar URL
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={c.destination_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir destino
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={async () => {
                  if (!confirm(`Excluir "${c.name}"? Os cliques também serão removidos.`)) return;
                  await del({ data: { id: c.id } });
                  toast.success("Campanha excluída");
                  onChange();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

function MetaStat({ label, value, truncate }: { label: string; value: string | number; truncate?: boolean }) {
  return (
    <div className="rounded-md border bg-background px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
        <Info className="h-3 w-3 opacity-60" />
      </div>
      <div className={`mt-1 text-2xl font-semibold text-foreground ${truncate ? "truncate text-sm font-normal" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function NewCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [destination, setDestination] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [campaignType, setCampaignType] = useState<string>("");
  const [linkIntent, setLinkIntent] = useState<string>("");
  const [pageCategory, setPageCategory] = useState<string>("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [intermediateText, setIntermediateText] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [openMode, setOpenMode] = useState<string>("smart");
  const [participants, setParticipants] = useState<Participant[]>([]);

  const create = useServerFn(createCampaign);
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      create({ data: input as never }),
    onSuccess: (created) => {
      toast.success("Campanha criada como rascunho");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.invalidate();
      setName(""); setSlug(""); setDestination(""); setSlugTouched(false);
      setCampaignType(""); setLinkIntent(""); setPageCategory("");
      setLinkTitle(""); setLinkDescription(""); setIntermediateText(""); setCtaLabel("");
      setOpenMode("smart");
      setParticipants([]);
      setOpen(false);
      onCreated();
      router.navigate({ to: "/admin/campaigns/$id/edit", params: { id: created.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar"),
  });

  function onIntentChange(value: string) {
    setLinkIntent(value);
    const form = {
      link_title: linkTitle,
      link_description: linkDescription,
      intermediate_text: intermediateText,
      cta_label: ctaLabel,
      og_type: "",
      og_title: "",
      og_description: "",
      page_category: pageCategory,
    };
    const { next, changed } = applyIntentPreset(form, value, false);
    if (changed.length === 0) return;
    if (changed.includes("link_title")) setLinkTitle(next.link_title);
    if (changed.includes("link_description")) setLinkDescription(next.link_description);
    if (changed.includes("intermediate_text")) setIntermediateText(next.intermediate_text);
    if (changed.includes("cta_label")) setCtaLabel(next.cta_label);
    if (changed.includes("page_category")) setPageCategory(next.page_category);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nova campanha</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Defina nome, slug, destino e a intenção do link. Os campos serão pré-preenchidos
            conforme a intenção escolhida — você poderá ajustar tudo no editor.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              name: name.trim(),
              slug: slug.trim() || undefined,
              destination_url: destination.trim(),
              campaign_type: campaignType || undefined,
              link_intent: linkIntent || undefined,
              page_category: pageCategory || undefined,
              link_title: linkTitle.trim() || undefined,
              link_description: linkDescription.trim() || undefined,
              intermediate_text: intermediateText.trim() || undefined,
              cta_label: ctaLabel.trim() || undefined,
              open_mode: openMode as "smart" | "iframe" | "redirect" | "wrapper",
              participants,
            });
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name" required value={name}
                placeholder="Disparos Magistrar — Dia 26"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug" required value={slug}
                placeholder="disparos-magistrar-dia-26"
                onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
              />
              <p className="text-xs text-muted-foreground">
                URL pública: <code>/{slug || "..."}</code>
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="dest">URL de destino</Label>
              <Input
                id="dest" type="url" required
                placeholder="https://exemplo.com/oferta"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ctype">Tipo de campanha</Label>
              <select
                id="ctype"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value)}
              >
                <option value="">—</option>
                {CAMPAIGN_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="intent">Intenção do link</Label>
              <select
                id="intent"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={linkIntent}
                onChange={(e) => onIntentChange(e.target.value)}
              >
                <option value="">—</option>
                {LINK_INTENTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pcat">Categoria da página</Label>
              <select
                id="pcat"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={pageCategory}
                onChange={(e) => setPageCategory(e.target.value)}
              >
                <option value="">—</option>
                {PAGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="omode">Modo de abertura</Label>
              <select
                id="omode"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={openMode}
                onChange={(e) => setOpenMode(e.target.value)}
              >
                {OPEN_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {OPEN_MODES.find((m) => m.value === openMode)?.description}
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ltitle">Título do link</Label>
              <Input id="ltitle" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ldesc">Descrição do link</Label>
              <textarea
                id="ldesc" rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={linkDescription}
                onChange={(e) => setLinkDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="itext">Texto da página intermediária</Label>
              <textarea
                id="itext" rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={intermediateText}
                onChange={(e) => setIntermediateText(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cta">Texto do botão (CTA)</Label>
              <Input id="cta" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <ParticipantsSelect
                value={participants}
                onChange={setParticipants}
                label="Sócios responsáveis pela campanha"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Criando..." : "Criar e configurar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
