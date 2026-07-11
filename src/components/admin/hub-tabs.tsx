import { Link, useRouterState } from "@tanstack/react-router";

export type HubTab = {
  to: string;
  label: string;
  search?: Record<string, string>;
};

type Props = {
  tabs: HubTab[];
  className?: string;
};

/**
 * Barra de sub-abas para páginas hub (Financeiro, Clientes, Relatórios, Configurações).
 * Mantém a sidebar enxuta e navega entre telas relacionadas dentro da mesma seção.
 */
export function HubTabs({ tabs, className }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });

  const isActive = (t: HubTab) => {
    const pathMatches = pathname === t.to || pathname.startsWith(t.to + "/");
    if (!pathMatches) return false;
    // If another tab has a longer path that also matches, prefer that one.
    const hasMoreSpecific = tabs.some(
      (other) =>
        other !== t &&
        other.to.length > t.to.length &&
        (pathname === other.to || pathname.startsWith(other.to + "/")),
    );
    if (hasMoreSpecific) return false;
    if (!t.search) return true;
    return Object.entries(t.search).every(
      ([k, v]) => String((search as any)?.[k] ?? "") === v,
    );
  };

  return (
    <div
      className={`mb-4 flex flex-wrap gap-1 rounded-xl border bg-card p-1 ${className ?? ""}`}
    >
      {tabs.map((t) => {
        const active = isActive(t);
        return (
          <Link
            key={`${t.to}-${t.label}`}
            to={t.to}
            search={t.search ?? undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

// Presets de abas por hub — importe onde renderizar.
export const FINANCEIRO_TABS: HubTab[] = [
  { to: "/admin/financeiro", label: "Carteira SaaS" },
  { to: "/admin/precificacao", label: "Precificação" },
  { to: "/admin/faturamento", label: "Faturamento" },
  { to: "/admin/custos", label: "Custos" },
  { to: "/admin/estoque", label: "Estoque" },
  { to: "/admin/fechamento", label: "Fechamentos" },
  { to: "/admin/historico", label: "Histórico" },
];

export const CLIENTES_TABS: HubTab[] = [
  { to: "/admin/clientes", label: "Clientes" },
  { to: "/admin/projetos", label: "Projetos" },
  { to: "/admin/contatos", label: "Contatos" },
  { to: "/admin/contatos/listas", label: "Listas" },
  { to: "/admin/contatos/auditoria", label: "Auditoria de import" },
];

export const RELATORIOS_TABS: HubTab[] = [
  { to: "/admin/relatorios", label: "Relatórios" },
  { to: "/admin/relatorios/analytics", label: "Analytics" },
  { to: "/admin/whatsapp/relatorios", label: "WhatsApp" },
  { to: "/admin/agenda", label: "Agenda" },
];

export const CONFIG_TABS: HubTab[] = [
  { to: "/admin/configuracoes", label: "Geral" },
  { to: "/admin/configuracoes", search: { tab: "usuarios" }, label: "Usuários" },
  { to: "/admin/configuracoes", search: { tab: "permissoes" }, label: "Permissões" },
  { to: "/admin/configuracoes", search: { tab: "tokens" }, label: "Tokens" },
  { to: "/admin/whatsapp/logs", label: "Logs do sistema" },
];
