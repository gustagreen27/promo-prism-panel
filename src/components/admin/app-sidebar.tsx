import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Megaphone,
  Link2,
  Users,
  ListChecks,
  FileText,
  Phone,
  Building2,
  BarChart3,
  Webhook,
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
  matches?: string[];
};

// Sidebar do admin — cada função em um único lugar, sem duplicidade.
const NAV: NavItem[] = [
  { title: "Visão geral", to: "/admin", icon: LayoutDashboard },
  { title: "Disparos", to: "/admin/disparos", icon: Megaphone },
  { title: "Campanhas", to: "/admin/campanhas", icon: Link2 },
  { title: "Contatos", to: "/admin/contatos", icon: Users, matches: ["/admin/clientes", "/admin/projetos"] },
  { title: "Listas", to: "/admin/contatos/listas", icon: ListChecks },
  { title: "Templates", to: "/admin/whatsapp/templates", icon: FileText },
  { title: "Números", to: "/admin/whatsapp/numeros", icon: Phone, matches: ["/admin/whatsapp/conversas"] },
  { title: "WABAs", to: "/admin/whatsapp/wabas", icon: Building2 },
  { title: "Relatórios", to: "/admin/relatorios", icon: BarChart3, matches: ["/admin/financeiro", "/admin/agenda"] },
  { title: "Webhooks", to: "/admin/whatsapp/webhooks", icon: Webhook },
  { title: "Configurações", to: "/admin/configuracoes", icon: Settings },
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

