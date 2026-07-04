import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Send,
  Users,
  FileText,
  MessageSquare,
  BarChart3,
  CreditCard,
  Settings,
  LogOut,
} from "lucide-react";

export const Route = createFileRoute("/painel")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });

    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(id, name, slug, plan, status)")
      .eq("user_id", data.user.id);

    const first = memberships?.[0];
    if (!first) {
      // Sem workspace: manda para cadastro/onboarding
      throw redirect({ to: "/cadastro" });
    }
    return {
      user: data.user,
      workspaceId: first.workspace_id,
      workspaceRole: first.role,
      workspace: (first as unknown as { workspaces: { id: string; name: string; slug: string | null; plan: string; status: string } }).workspaces,
    };
  },
  component: PanelLayout,
});

const NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }> = [
  { to: "/painel", label: "Início", icon: LayoutDashboard, exact: true },
  { to: "/painel/campanhas", label: "Campanhas", icon: Send },
  { to: "/painel/contatos", label: "Contatos", icon: Users },
  { to: "/painel/templates", label: "Templates", icon: FileText },
  { to: "/painel/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/painel/financeiro", label: "Financeiro", icon: CreditCard },
  { to: "/painel/configuracoes", label: "Configurações", icon: Settings },
];

function PanelLayout() {
  const { workspace } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-60 shrink-0 border-r bg-background md:block">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground text-sm">D</span>
          Disparos FR
        </div>
        <div className="px-4 py-3 text-xs text-muted-foreground truncate">
          {workspace?.name ?? "Meu workspace"}
        </div>
        <nav className="space-y-0.5 px-2">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
          <div className="text-sm font-medium">{workspace?.name ?? "Painel"}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
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
