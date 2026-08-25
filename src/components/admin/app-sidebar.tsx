import { Fragment } from "react";
import { Link, useNavigate, useRouterState, useRouteContext } from "@tanstack/react-router";
import {
  ClipboardCheck,
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
  MessageSquare,
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
  MessageCircle,
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
import logoAsset from "@/assets/next-disparos-logo.png.asset.json";

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
    label: "Principal",
    items: [
      { title: "Visão geral", to: "/admin", icon: LayoutDashboard },
      { title: "Disparos", to: "/admin/disparos", icon: Megaphone },
      { title: "Demandas de disparo", to: "/admin/demandas", icon: ClipboardCheck },
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
    label: "Atendimento",
    items: [
      {
        title: "Atendimento",
        to: "/admin/atendimento",
        icon: MessageSquare,
        matches: ["/admin/whatsapp/inbox", "/admin/whatsapp/conversas"],
      },
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
      { title: "Contas e créditos", to: "/admin/contas", icon: Wallet },
      { title: "Conciliação", to: "/admin/conciliacao", icon: Wallet },
      { title: "Projetos", to: "/admin/projetos", icon: FolderKanban },
      { title: "Gestão de Ativos Meta", to: "/admin/meta-ativos", icon: Boxes },

      {
        title: "Configurações",
        to: "/admin/configuracoes",
        icon: Settings,
        matches: ["/admin/whatsapp/configuracoes"],
      },
    ],
  },
];

// Bloco destacado "Configuração do WhatsApp" (colapsável), como no design.
const WHATSAPP_ITEMS: NavLeaf[] = [
  { title: "Conexões", to: "/admin/whatsapp/conexoes", icon: Link2 },
  { title: "WABAs", to: "/admin/whatsapp/wabas", icon: Building2 },
  {
    title: "Números",
    to: "/admin/whatsapp/numeros",
    icon: Phone,
    matches: ["/admin/whatsapp/qualidade"],
  },
  {
    title: "Templates",
    to: "/admin/whatsapp/templates",
    icon: FileText,
    matches: ["/admin/whatsapp/utility"],
  },
  { title: "Webhooks", to: "/admin/whatsapp/webhooks", icon: Webhook },
  { title: "Liberações", to: "/admin/whatsapp/liberacoes", icon: ShieldCheck },
  { title: "Supressão global", to: "/admin/whatsapp/supressao", icon: ShieldCheck },
];

const ALL_ITEMS: NavLeaf[] = [...GROUPS.flatMap((g) => g.items), ...WHATSAPP_ITEMS];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const waOpen = pathname.startsWith("/admin/whatsapp");
  const { attendanceOnly } = useRouteContext({ from: "/_authenticated" }) as {
    attendanceOnly?: boolean;
  };
  const visibleGroups = attendanceOnly
    ? GROUPS.filter((g) => g.label === "Atendimento")
    : GROUPS;

  const isActive = (item: NavLeaf) => {
    if (item.to === "/admin") return pathname === "/admin";
    if (pathname === item.to || pathname.startsWith(item.to + "/")) {
      // avoid parent stealing highlight from a longer sibling
      const hasLonger = ALL_ITEMS.some(
        (o) =>
          o !== item &&
          o.to.length > item.to.length &&
          (pathname === o.to || pathname.startsWith(o.to + "/")),
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

  const waBlock = (
        <SidebarGroup>
          <SidebarGroupContent>
            <Collapsible defaultOpen={waOpen} className="group/wa">
              <div className="rounded-2xl border bg-muted/30 p-1.5 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <MessageCircle className="h-4.5 w-4.5" />
                    </span>
                    <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">
                      Configuração do WhatsApp
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=closed]/wa:-rotate-90 group-data-[collapsible=icon]:hidden" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenu className="mt-1 gap-0.5">
                    {WHATSAPP_ITEMS.map((item) => {
                      const active = isActive(item);
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.title}
                            className="h-9 rounded-xl"
                          >
                            <Link to={item.to} className="flex items-center gap-3">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                  active ? "text-primary" : "text-foreground/70"
                                }`}
                              >
                                <item.icon className="h-4 w-4" />
                              </span>
                              <span className={active ? "font-semibold text-primary" : ""}>
                                {item.title}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </SidebarGroupContent>
        </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r bg-sidebar">
      <SidebarHeader className="border-b px-4 py-4">
        <Link to="/admin" className="flex items-center gap-2">
          <span className="grid h-9 place-items-center rounded-lg bg-[#0b0c0e] px-2.5 group-data-[collapsible=icon]:hidden">
            <img
              src={logoAsset.url}
              alt="Disparos FR"
              className="h-6 w-auto object-contain"
            />
          </span>
          <span className="hidden h-8 w-8 place-items-center rounded-lg bg-[#0b0c0e] group-data-[collapsible=icon]:grid">
            <img
              src={logoAsset.url}
              alt="Disparos FR"
              className="h-5 w-5 object-contain object-left"
              style={{ objectPosition: "left center" }}
            />
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {visibleGroups.map((group) => (
          <Fragment key={group.label}>
          {!attendanceOnly && group.label === "Atendimento" ? waBlock : null}
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="h-10 rounded-xl"
                      >
                        <Link to={item.to} className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              active ? "bg-primary/10 text-primary" : "text-foreground/70"
                            }`}
                          >
                            <item.icon className="h-4.5 w-4.5" />
                          </span>
                          <span className={active ? "font-semibold" : ""}>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          </Fragment>
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
