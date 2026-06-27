import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  TrendingDown,
  Calendar,
  ClipboardCheck,
  History,
  Boxes,
  MessageSquare,
  Users,
  Briefcase,
  Sparkles,
  Tv,
  Settings,
  LogOut,
  Printer,
  Megaphone,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { title: string; to: string; icon: React.ComponentType<{ className?: string }> };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão Geral",
    items: [{ title: "Dashboard", to: "/", icon: LayoutDashboard }],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Faturamento", to: "/faturamento", icon: Wallet },
      { title: "Custos", to: "/custos", icon: TrendingDown },
    ],
  },
  {
    label: "Operacional",
    items: [
      { title: "Agenda", to: "/agenda", icon: Calendar },
      { title: "Fechamento", to: "/fechamento", icon: ClipboardCheck },
      { title: "Histórico", to: "/historico", icon: History },
      { title: "Estoque de Msgs", to: "/estoque", icon: Boxes },
      { title: "WhatsApp", to: "/whatsapp", icon: MessageSquare },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Clientes", to: "/clientes", icon: Users },
      { title: "Projetos", to: "/projetos", icon: Briefcase },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { title: "Campanhas", to: "/campanhas", icon: Megaphone },
      { title: "Upsell", to: "/upsell", icon: Sparkles },
      { title: "Dashboard TV", to: "/tv", icon: Tv },
    ],
  },
  {
    label: "Sistema",
    items: [{ title: "Configurações", to: "/configuracoes", icon: Settings }],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-white/5">
      <SidebarHeader className="border-b border-white/5 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 text-white shadow-lg shadow-blue-500/20">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-tight">Painel SaaS</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              Gestão integrada
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.title}>
                      <Link to={item.to} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/5 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => window.print()} tooltip="Imprimir / Exportar">
              <Printer className="h-4 w-4" />
              <span>Imprimir</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Sair">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
