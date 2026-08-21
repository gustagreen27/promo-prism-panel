import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Plus, History, Send } from "lucide-react";

export const Route = createFileRoute("/painel/campanhas")({
  head: () => ({ meta: [{ title: "Meus Disparos — Painel" }] }),
  component: Page,
});

type Row = {
  id: string;
  name: string;
  status: string;
  approval_status: string;
  total_recipients: number | null;
  created_at: string;
  scheduled_at: string | null;
};

type Bucket = "all" | "received" | "configuring" | "sending" | "done" | "cancelled";

const BUCKETS: Array<{ key: Bucket; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "received", label: "Recebido" },
  { key: "configuring", label: "Configurando" },
  { key: "sending", label: "Disparando" },
  { key: "done", label: "Realizado" },
  { key: "cancelled", label: "Cancelado" },
];

function bucketOf(status: string): Bucket {
  switch (status) {
    case "draft":
    case "awaiting_approval":
      return "received";
    case "scheduled":
    case "queued":
      return "configuring";
    case "running":
    case "paused":
      return "sending";
    case "completed":
    case "partial":
      return "done";
    case "cancelled":
    case "error":
    case "blocked":
      return "cancelled";
    default:
      return "received";
  }
}

const BADGE: Record<Bucket, string> = {
  all: "",
  received: "bg-muted text-muted-foreground",
  configuring: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sending: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-destructive/10 text-destructive",
};

const PERIODS = [
  { value: "all", label: "Selecionar período" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

const PAGE_SIZE = 10;

function Page() {
  const { workspaceId } = Route.useRouteContext() as { workspaceId: string };
  const navigate = useNavigate();
  const [tab, setTab] = useState<Bucket>("all");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["campaigns", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("wa_campaigns")
        .select("id,name,status,approval_status,total_recipients,created_at,scheduled_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as Row[]) || [];
    },
  });

  const scoped = useMemo(() => {
    const term = q.trim().toLowerCase();
    const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86400_000;
    return rows.filter((r) => {
      if (term && !r.name.toLowerCase().includes(term)) return false;
      if (cutoff && new Date(r.scheduled_at ?? r.created_at).getTime() < cutoff) return false;
      return true;
    });
  }, [rows, q, period]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { all: scoped.length, received: 0, configuring: 0, sending: 0, done: 0, cancelled: 0 };
    scoped.forEach((r) => { c[bucketOf(r.status)]++; });
    return c;
  }, [scoped]);

  const filtered = useMemo(
    () => (tab === "all" ? scoped : scoped.filter((r) => bucketOf(r.status) === tab)),
    [scoped, tab],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meus Disparos</h1>
          <p className="text-sm text-muted-foreground">Acompanhe o status de todos os seus disparos</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-10 rounded-xl">
            <Link to="/painel/campanhas/historico"><History className="mr-1.5 h-4 w-4" />Histórico</Link>
          </Button>
          <Button asChild size="sm" className="h-10 rounded-xl px-5">
            <Link to="/painel/campanhas/nova"><Plus className="mr-1.5 h-4 w-4" />Novo Disparo</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const active = tab === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => { setTab(b.key); setPage(1); }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {b.label}
              <span className={active ? "opacity-80" : "opacity-70"}>{counts[b.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={period} onValueChange={(v) => { setPeriod(v); setPage(1); }}>
          <SelectTrigger className="h-11 w-56 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Buscar por nome do disparo..."
          className="h-11 w-full max-w-sm rounded-xl"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {isLoading ? (
          <p className="p-8 text-sm text-muted-foreground">Carregando…</p>
        ) : pageRows.length === 0 ? (
          <div className="p-12 text-center">
            <Send className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nenhum disparo encontrado</p>
            <p className="text-xs text-muted-foreground">Ajuste os filtros ou crie um novo disparo.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {pageRows.map((r) => {
              const b = bucketOf(r.status);
              const when = new Date(r.scheduled_at ?? r.created_at);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/painel/campanhas" })}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {when.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {(r.total_recipients ?? 0).toLocaleString("pt-BR")} contatos
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${BADGE[b]}`}>
                      {BUCKETS.find((x) => x.key === b)?.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
            <span className="text-sm text-muted-foreground">
              Página {current} de {totalPages} · {filtered.length} registros
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-lg" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" className="rounded-lg" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Seguinte</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
