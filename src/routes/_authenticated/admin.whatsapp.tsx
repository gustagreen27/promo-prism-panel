import { createFileRoute, Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/admin/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Painel" }] }),
  component: Layout,
});

const TABS = [
  { to: "/admin/whatsapp/conexoes", label: "Conexões" },
  { to: "/admin/whatsapp/numeros", label: "Números" },
  { to: "/admin/whatsapp/wabas", label: "WABAs" },
  { to: "/admin/whatsapp/templates", label: "Templates" },
  { to: "/admin/whatsapp/inbox", label: "Inbox" },
  { to: "/admin/whatsapp/webhooks", label: "Webhooks" },
  { to: "/admin/whatsapp/liberacoes", label: "Liberações" },
  { to: "/admin/whatsapp/qualidade", label: "Qualidade" },
  { to: "/admin/whatsapp/logs", label: "Logs" },
  { to: "/admin/whatsapp/configuracoes", label: "Configurações" },
];

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  useEffect(() => {
    if (pathname === "/admin/whatsapp") nav({ to: "/admin/whatsapp/numeros", replace: true });
  }, [pathname, nav]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {TABS.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
