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
  FileText,
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
import logoAsset from "@/assets/disparos-fr-logo.png.asset.json";

type NavItem = { title: string; to: string; icon: React.ComponentType<{ className?: string }> };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão Geral",
    items: [{ title: "Dashboard", to: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Faturamento", to: "/admin/faturamento", icon: Wallet },
      { title: "Custos", to: "/admin/custos", icon: TrendingDown },
    ],
  },
  {
    label: "Operacional",
    items: [
      { title: "Agenda", to: "/admin/agenda", icon: Calendar },
      { title: "Fechamento", to: "/admin/fechamento", icon: ClipboardCheck },
      { title: "Relatórios", to: "/admin/relatorios", icon: FileText },
      { title: "Histórico", to: "/admin/historico", icon: History },
      { title: "Estoque de Msgs", to: "/admin/estoque", icon: Boxes },
      { title: "WhatsApp", to: "/admin/whatsapp", icon: MessageSquare },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Clientes", to: "/admin/clientes", icon: Users },
      { title: "Projetos", to: "/admin/projetos", icon: Briefcase },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { title: "Campanhas", to: "/admin/campanhas", icon: Megaphone },
      { title: "Upsell", to: "/admin/upsell", icon: Sparkles },
      { title: "Dashboard TV", to: "/admin/tv", icon: Tv },
    ],
  },
  {
    label: "Sistema",
    items: [{ title: "Configurações", to: "/admin/configuracoes", icon: Settings }],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const isActive = (to: string) =>
    to === "/admin" ? pathname === "/admin" : pathname === to || pathname.startsWith(to + "/");

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <img
            src={logoAsset.url}
            alt="Disparos FR"
            className="h-8 w-auto object-contain group-data-[collapsible=icon]:hidden"
          />
          <img
            src={logoAsset.url}
            alt="Disparos FR"
            className="hidden h-7 w-7 shrink-0 object-contain object-left group-data-[collapsible=icon]:block"
            style={{ objectPosition: "left center" }}
          />
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
