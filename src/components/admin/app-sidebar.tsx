import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Megaphone,
  CalendarDays,
  Users,
  ListChecks,
  Globe,
  Link2,
  Phone,
  Building2,
  FileText,
  Inbox,
  Webhook,
  ShieldCheck,
  BarChart3,
  History,
  Wallet,
  Briefcase,
  FolderKanban,
  Settings,
  LogOut,
  ChevronDown,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/disparos-fr-logo.png.asset.json";

type NavLeaf = {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  matches?: string[];
};

type NavGroup = {
  label: string;
  items: NavLeaf[];
};

// Sidebar do admin — 5 grupos, cada função em UM único lugar.
// URLs preservadas; onde havia colisão semântica ("Campanhas") o rótulo foi rebatizado.
const GROUPS: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { title: "Visão geral", to: "/admin", icon: LayoutDashboard },
      { title: "Disparos", to: "/admin/disparos", icon: Megaphone },
      { title: "Agenda", to: "/admin/agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Público",
    items: [
      {
        title: "Contatos",
        to: "/admin/contatos",
        icon: Users,
        matches: ["/admin/clientes", "/admin/projetos"],
      },
      { title: "Listas", to: "/admin/contatos/listas", icon: ListChecks },
      {
        title: "Páginas públicas",
        to: "/admin/campanhas",
        icon: Globe,
        matches: ["/admin/campaigns", "/admin/campanhas-aprovacao"],
      },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { title: "Conexões", to: "/admin/whatsapp/conexoes", icon: Link2 },
      {
        title: "Números",
        to: "/admin/whatsapp/numeros",
        icon: Phone,
        matches: ["/admin/whatsapp/qualidade"],
      },
      { title: "WABAs", to: "/admin/whatsapp/wabas", icon: Building2 },
      { title: "Templates", to: "/admin/whatsapp/templates", icon: FileText },
      {
        title: "Inbox",
        to: "/admin/whatsapp/inbox",
        icon: Inbox,
        matches: ["/admin/whatsapp/conversas"],
      },
      { title: "Webhooks", to: "/admin/whatsapp/webhooks", icon: Webhook },
      { title: "Liberações", to: "/admin/whatsapp/liberacoes", icon: ShieldCheck },
    ],
  },
  {
    label: "Análise",
    items: [
      {
        title: "Relatórios",
        to: "/admin/relatorios",
        icon: BarChart3,
        matches: ["/admin/whatsapp/relatorios"],
      },
      {
        title: "Histórico",
        to: "/admin/historico",
        icon: History,
        matches: ["/admin/whatsapp/logs"],
      },
    ],
  },
  {
    label: "Financeiro & Sistema",
    items: [
      {
        title: "Financeiro",
        to: "/admin/financeiro",
        icon: Wallet,
        matches: [
          "/admin/faturamento",
          "/admin/custos",
          "/admin/fechamento",
          "/admin/precificacao",
          "/admin/estoque",
        ],
      },
      { title: "Clientes", to: "/admin/clientes", icon: Briefcase },
      { title: "Projetos", to: "/admin/projetos", icon: FolderKanban },
      {
        title: "Configurações",
        to: "/admin/configuracoes",
        icon: Settings,
        matches: ["/admin/whatsapp/configuracoes"],
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const isActive = (item: NavLeaf) => {
    if (item.to === "/admin") return pathname === "/admin";
    if (pathname === item.to || pathname.startsWith(item.to + "/")) {
      // avoid parent stealing highlight from a longer sibling
      const hasLonger = GROUPS.some((g) =>
        g.items.some(
          (o) =>
            o !== item &&
            o.to.length > item.to.length &&
            (pathname === o.to || pathname.startsWith(o.to + "/")),
        ),
      );
      return !hasLonger;
    }
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
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
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
