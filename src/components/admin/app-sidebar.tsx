import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Briefcase,
  FileText,
  Link2,
  Inbox,
  History,
  Boxes,
  ClipboardCheck,
  TrendingDown,
  Calendar,
  Shield,
  Key,
  UserCog,
  Building2,
  Tag,
  ListTree,
  Sparkles,
  Webhook,
  Plus,
  PlayCircle,
  CheckCircle2,
  Clock,
  BadgeDollarSign,
  BarChart2,
  Hash,
  User,
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

type NavItem = {
  title: string;
  to: string;
  search?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
};

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [{ title: "Dashboard", to: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "WhatsApp",
    items: [
      { title: "WABAs", to: "/admin/whatsapp/wabas", icon: Briefcase },
      { title: "Números", to: "/admin/whatsapp/numeros", icon: Hash },
      { title: "Templates", to: "/admin/whatsapp/templates", icon: FileText },
      { title: "Embedded Signup", to: "/admin/whatsapp/embedded-signup", icon: Sparkles },
      { title: "Webhooks", to: "/admin/whatsapp/webhooks", icon: Webhook },
      { title: "Inbox", to: "/admin/whatsapp/inbox", icon: Inbox },
      { title: "Logs", to: "/admin/whatsapp/logs", icon: History },
    ],
  },
  {
    label: "Campanhas Disparo",
    items: [
      { title: "Todas as campanhas", to: "/admin/whatsapp-campanhas", icon: Megaphone },
      { title: "Nova campanha", to: "/admin/whatsapp-campanhas/novo", icon: Plus },
      { title: "Agendadas", to: "/admin/whatsapp-campanhas", search: { status: "scheduled" }, icon: Clock },
      { title: "Em andamento", to: "/admin/whatsapp-campanhas", search: { status: "running" }, icon: PlayCircle },
      { title: "Concluídas", to: "/admin/whatsapp-campanhas", search: { status: "completed" }, icon: CheckCircle2 },
      { title: "Relatórios de campanha", to: "/admin/whatsapp/relatorios", icon: BarChart3 },
    ],
  },
  {
    label: "Cloaker",
    items: [{ title: "Cloaker", to: "/admin/campanhas", icon: Link2 }],
  },
  {
    label: "Clientes",
    items: [
      { title: "Clientes", to: "/admin/clientes", icon: Building2 },
      { title: "Projetos", to: "/admin/projetos", icon: Briefcase },
      { title: "Contatos", to: "/admin/contatos", icon: Users },
      { title: "Listas", to: "/admin/contatos/listas", icon: ListTree },
      { title: "Tags", to: "/admin/contatos", search: { view: "tags" }, icon: Tag },
      { title: "Segmentos", to: "/admin/contatos", search: { view: "segmentos" }, icon: ListTree },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Precificação", to: "/admin/precificacao", icon: BadgeDollarSign },
      { title: "Carteira SaaS", to: "/admin/financeiro", icon: BadgeDollarSign },
      { title: "Faturamento", to: "/admin/faturamento", icon: BadgeDollarSign },
      { title: "Custos", to: "/admin/custos", icon: TrendingDown },
      { title: "Estoque de mensagens", to: "/admin/estoque", icon: Boxes },
      { title: "Fechamentos", to: "/admin/fechamento", icon: ClipboardCheck },
      { title: "Histórico financeiro", to: "/admin/historico", icon: History },
    ],
  },
  {
    label: "Relatórios",
    items: [
      { title: "Relatório geral", to: "/admin/relatorios", icon: BarChart3 },
      { title: "Por cliente", to: "/admin/whatsapp/relatorios", search: { groupBy: "client" }, icon: Building2 },
      { title: "Por campanha", to: "/admin/whatsapp/relatorios", search: { groupBy: "campaign" }, icon: Megaphone },
      { title: "Por número", to: "/admin/whatsapp/relatorios", search: { groupBy: "number" }, icon: Hash },
      { title: "Por template", to: "/admin/whatsapp/relatorios", search: { groupBy: "template" }, icon: FileText },
      { title: "Por responsável", to: "/admin/whatsapp/relatorios", search: { groupBy: "responsavel" }, icon: User },
      { title: "Analytics", to: "/admin/relatorios/analytics", icon: BarChart2 },
      { title: "Agenda", to: "/admin/agenda", icon: Calendar },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Configurações", to: "/admin/configuracoes", icon: Settings },
      { title: "Permissões", to: "/admin/configuracoes", search: { tab: "permissoes" }, icon: Shield },
      { title: "Usuários", to: "/admin/configuracoes", search: { tab: "usuarios" }, icon: UserCog },
      { title: "Tokens / Secrets", to: "/admin/configuracoes", search: { tab: "tokens" }, icon: Key },
      { title: "Logs do sistema", to: "/admin/whatsapp/logs", icon: History },
    ],
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
