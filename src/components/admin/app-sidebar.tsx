import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageCircle,
  Megaphone,
  Building2,
  BadgeDollarSign,
  BarChart3,
  Link2,
  Settings,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/disparos-fr-logo.png.asset.json";

type NavItem = {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Rotas que também ativam este item (para hubs com sub-abas). */
  matches?: string[];
};

// Sidebar enxuta: 8 áreas principais. Cada uma tem sub-abas dentro da própria página.
const NAV: NavItem[] = [
  { title: "Dashboard", to: "/admin", icon: LayoutDashboard },
  {
    title: "WhatsApp",
    to: "/admin/whatsapp/conversas",
    icon: MessageCircle,
    matches: ["/admin/whatsapp"],
  },
  {
    title: "Campanhas",
    to: "/admin/whatsapp-campanhas",
    icon: Megaphone,
  },
  {
    title: "Clientes",
    to: "/admin/clientes",
    icon: Building2,
    matches: ["/admin/projetos", "/admin/contatos"],
  },
  {
    title: "Financeiro",
    to: "/admin/financeiro",
    icon: BadgeDollarSign,
    matches: [
      "/admin/precificacao",
      "/admin/faturamento",
      "/admin/custos",
      "/admin/estoque",
      "/admin/fechamento",
      "/admin/historico",
    ],
  },
  {
    title: "Relatórios",
    to: "/admin/relatorios",
    icon: BarChart3,
    matches: ["/admin/agenda", "/admin/whatsapp/relatorios"],
  },
  { title: "Cloaker", to: "/admin/campanhas", icon: Link2 },
  {
    title: "Configurações",
    to: "/admin/configuracoes",
    icon: Settings,
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();

  const isActive = (item: NavItem) => {
    const pathMatches =
      item.to === "/admin" ? pathname === "/admin" : pathname === item.to || pathname.startsWith(item.to + "/");
    if (!pathMatches) return false;
    if (!item.search) return true;
    return Object.entries(item.search).every(([k, v]) => String((search as any)?.[k] ?? "") === v);
  };

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <Sidebar collapsible="icon" className="border-r bg-sidebar">
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
                  <SidebarMenuItem key={`${item.to}-${item.title}`}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                      <Link
                        to={item.to}
                        search={item.search ?? undefined}
                        className="flex items-center gap-2"
                      >
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

      <SidebarFooter className="border-t border-border p-2">
        <SidebarMenu>
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
