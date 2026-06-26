import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
} from "@/lib/campaigns.functions";
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
import { Copy, ExternalLink, Trash2, BarChart3, Pencil } from "lucide-react";
import { IntentScoreBadge, StatusBadge } from "@/components/campaign-badges";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Campanhas — Painel" }] }),
  component: CampaignsList,
});

function CampaignsList() {
  const list = useServerFn(listCampaigns);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => list(),
  });

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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma campanha ainda. Crie a primeira para gerar uma URL.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data.map((c) => (
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
  const publicUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${c.slug}` : `/${c.slug}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{c.name}</CardTitle>
            <StatusBadge status={c.status} />
            <IntentScoreBadge score={c.intent_score} />
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
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/campaigns/$id/edit" params={{ id: c.id }}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/campaigns/$id" params={{ id: c.id }}>
              <BarChart3 className="mr-1 h-4 w-4" /> Métricas
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl);
              toast.success("URL copiada");
            }}
            title="Copiar URL"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" asChild title="Abrir destino">
            <a href={c.destination_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Excluir"
            onClick={async () => {
              if (!confirm(`Excluir "${c.name}"? Os cliques também serão removidos.`)) return;
              await del({ data: { id: c.id } });
              toast.success("Campanha excluída");
              onChange();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4 text-sm">
        <Stat label="Cliques totais" value={c.total_clicks} />
        <Stat label="Cliques únicos (IP)" value={c.unique_clicks} />
        <Stat label="Destino" value={c.destination_url} truncate />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, truncate }: { label: string; value: string | number; truncate?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-medium ${truncate ? "truncate" : ""}`}>{value}</div>
    </div>
  );
}

function NewCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [destination, setDestination] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const create = useServerFn(createCampaign);
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (input: { name: string; slug?: string; destination_url: string }) =>
      create({ data: input }),
    onSuccess: (created) => {
      toast.success("Campanha criada como rascunho");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.invalidate();
      setName(""); setSlug(""); setDestination(""); setSlugTouched(false);
      setOpen(false);
      onCreated();
      // navega direto pro editor para preencher os demais campos
      router.navigate({ to: "/campaigns/$id/edit", params: { id: created.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nova campanha</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Comece com nome, slug e destino. Você poderá preencher categoria, OG, UTMs e
            rodar a análise de intenção em seguida.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              name: name.trim(),
              slug: slug.trim() || undefined,
              destination_url: destination.trim(),
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
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
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL)</Label>
            <Input
              id="slug" required value={slug}
              placeholder="disparos-magistrar-dia-26"
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
            />
            <p className="text-xs text-muted-foreground">
              URL pública: <code>/{slug || "..."}</code> — definido por você; deve ser único.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dest">URL de destino</Label>
            <Input
              id="dest" type="url" required
              placeholder="https://exemplo.com/oferta"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
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
