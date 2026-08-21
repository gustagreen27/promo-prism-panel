import {
  createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet, useBalanceConsistency } from "@/lib/use-panel-workspace";
import { getMyContext, ensureWorkspace, logAuthEvent, type MyContext } from "@/lib/auth.functions";
import {
  LayoutDashboard, Send, Users, BarChart3, CreditCard,
  LogOut, Wallet, Building2, AlertTriangle, ChevronDown, UserCircle,
} from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import logoAsset from "@/assets/next-disparos-logo.png.asset.json";

export const Route = createFileRoute("/painel")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  component: PanelLayout,
});

const NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }> = [
  { to: "/painel", label: "Início", icon: LayoutDashboard, exact: true },
  { to: "/painel/campanhas/nova", label: "Enviar Disparos", icon: Send },
  { to: "/painel/demandas", label: "Meus disparos", icon: ClipboardList },
  { to: "/painel/contatos", label: "Listas de Leads", icon: Users },
  { to: "/painel/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/painel/financeiro", label: "Mensagens", icon: CreditCard },
];

function PanelLayout() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx, isLoading } = useQuery({
    queryKey: ["my-context"],
    queryFn: () => ctxFn(),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <div className="text-sm text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  const ws = ctx?.primary_workspace ?? null;

  if (ws?.is_blocked) return <BlockedScreen reason={ws.block_reason} />;
  if (!ws) return <NoWorkspaceScreen />;

  return <PanelChrome ctx={ctx!} />;
}

function PanelChrome({ ctx }: { ctx: MyContext }) {
  const ws = ctx.primary_workspace!;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const logFn = useServerFn(logAuthEvent);

  async function signOut() {
    logFn({ data: { type: "logout" } }).catch(() => {});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const initials = (ctx.profile?.full_name ?? ctx.profile?.email ?? "?")
    .split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const NavList = ({ compact }: { compact?: boolean }) => (
    <>
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.to
          : pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to as never}
            className={
              compact
                ? `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${active ? "bg-primary/15 text-primary" : "text-muted-foreground"}`
                : `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-primary/15 text-primary" : "text-panel-nav-foreground/60 hover:bg-panel-nav-foreground/10 hover:text-panel-nav-foreground"}`
            }
          >
            <item.icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4 shrink-0"} />
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-app-canvas lg:flex">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-panel-nav-foreground/10 bg-panel-nav text-panel-nav-foreground lg:flex">
        <div className="border-b border-panel-nav-foreground/10 px-6 py-6">
          <Link to="/painel" className="block">
            <img src={logoAsset.url} alt="next Disparos" className="h-9 w-auto object-contain" />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavList />
        </nav>
        <div className="border-t border-panel-nav-foreground/10 p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                {initials}
              </span>
              <span className="truncate text-sm text-panel-nav-foreground/90">
                {ctx.profile?.full_name ?? ctx.profile?.email}
              </span>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sair"
              className="rounded-lg p-2 text-panel-nav-foreground/60 transition hover:bg-panel-nav-foreground/10 hover:text-panel-nav-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
            <Link to="/painel" className="flex shrink-0 items-center lg:hidden">
              <span className="grid h-9 place-items-center rounded-lg bg-panel-nav px-2.5">
                <img src={logoAsset.url} alt="next Disparos" className="h-6 w-auto object-contain" />
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground lg:inline">{ws.name}</span>
              <WalletBadge workspaceId={ws.id} />
              <NotificationsBell workspaceId={ws.id} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {initials}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{ctx.profile?.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/painel/configuracoes"><UserCircle className="mr-2 h-4 w-4" /> Minha conta</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 lg:hidden">
            <NavList compact />
          </nav>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}


function BlockedScreen({ reason }: { reason: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="max-w-md">
        <CardHeader>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-center">Conta suspensa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Sua conta está temporariamente bloqueada.{reason ? ` Motivo: ${reason}.` : ""}
          </p>
          <p className="text-sm text-muted-foreground">Entre em contato com o suporte para regularizar.</p>
          <Button variant="outline" className="w-full" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NoWorkspaceScreen() {
  const qc = useQueryClient();
  const ensureFn = useServerFn(ensureWorkspace);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome da empresa");
    setLoading(true);
    try {
      await ensureFn({ data: { company_name: name.trim() } });
      await qc.invalidateQueries({ queryKey: ["my-context"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar workspace");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-center">Complete seu cadastro</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Para começar, informe o nome da sua empresa. Vamos criar seu workspace.
            </p>
            <div className="space-y-2">
              <Label htmlFor="ws-name">Nome da empresa</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? "Criando…" : "Criar workspace e continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function WalletBadge({ workspaceId }: { workspaceId?: string }) {
  // Mesma queryKey ["wallet", ws] usada em /painel/financeiro e na criação de disparos.
  const { availableCredits: messages } = useWallet(workspaceId ?? null);
  // Registra o valor exibido para comparação com /painel/financeiro.
  useBalanceConsistency("header", messages, !!workspaceId);
  const low = messages < 1000;
  return (
    <Link
      to="/painel/financeiro"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:bg-muted ${low ? "border-destructive/60 text-destructive" : ""}`}
    >
      <Wallet className="h-3.5 w-3.5" />
      <span data-testid="header-credits">{messages.toLocaleString("pt-BR")}</span> msgs
    </Link>
  );
}
