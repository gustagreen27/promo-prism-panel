import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { getMyWallet } from "@/lib/billing.functions";
import { getMyContext, ensureWorkspace, logAuthEvent, type MyContext } from "@/lib/auth.functions";
import {
  LayoutDashboard, Send, Users, BarChart3, CreditCard, CalendarClock,
  LogOut, Wallet, Building2, AlertTriangle, ChevronDown, UserCircle, MessageCircle,
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
  { to: "/painel/campanhas", label: "Disparos", icon: Send },
  { to: "/painel/contatos", label: "Listas de Leads", icon: Users },
  { to: "/painel/agenda", label: "Agenda", icon: CalendarClock },
  { to: "/painel/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/painel/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/painel/financeiro", label: "Créditos", icon: CreditCard },
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

  return (
    <div className="flex min-h-screen flex-col bg-app-canvas">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/painel" className="flex shrink-0 items-center gap-2">
            <span className="grid h-9 place-items-center rounded-lg bg-[#0b0c0e] px-2.5">
              <img src={logoAsset.url} alt="next Disparos" className="h-6 w-auto object-contain" />
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to as never}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

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
                  <span className="hidden max-w-28 truncate text-sm sm:inline">
                    {ctx.profile?.full_name ?? ctx.profile?.email}
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

        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <Outlet />
        </div>
      </main>
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
  const wallet = useServerFn(getMyWallet);
  const { data } = useQuery({
    queryKey: ["wallet-badge", workspaceId],
    queryFn: () => wallet({ data: { workspace_id: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 30000,
  });
  const cents = data?.available_cents ?? 0;
  const low = data && data.unit_price_cents ? cents < data.unit_price_cents * 10 : false;
  return (
    <Link
      to="/painel/financeiro"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:bg-muted ${low ? "border-destructive/60 text-destructive" : ""}`}
    >
      <Wallet className="h-3.5 w-3.5" />
      {(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
    </Link>
  );
}
