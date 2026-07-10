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
    to: "/admin/disparos",
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
  const navigate = useNavigate();

  const isActive = (item: NavItem) => {
    if (item.to === "/admin") return pathname === "/admin";
    if (pathname === item.to || pathname.startsWith(item.to + "/")) return true;
    return (item.matches ?? []).some(
      (m) => pathname === m || pathname.startsWith(m + "/"),
    );
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item)}
                    tooltip={item.title}
                  >
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

