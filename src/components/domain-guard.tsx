import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { decide, zoneForHost, type Zone } from "@/lib/domain-routing";

/**
 * Reforço no cliente das regras de domínio definidas em src/lib/domain-routing.ts.
 * O bloqueio autoritativo (com status HTTP 404 real) acontece no edge (src/server.ts);
 * este guard evita que navegações internas (client-side routing) exibam a interface
 * de outro domínio sem recarregar a página.
 */
export function DomainGuard({ children }: { children: ReactNode }) {
  const location = useRouterState({ select: (s) => s.location });
  const [host, setHost] = useState<string | null>(null);

  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  const decision = host ? decide(host, location.pathname, location.searchStr ?? "") : null;

  useEffect(() => {
    if (decision?.kind === "redirect") {
      window.location.replace(decision.location);
    }
  }, [decision?.kind, decision?.kind === "redirect" ? decision.location : null]);

  if (decision?.kind === "notfound") {
    return <DomainNotFound zone={decision.zone} />;
  }

  return <>{children}</>;
}

export function DomainNotFound({ zone }: { zone: Zone }) {
  const neutral = zone === "slug";
  const cta =
    zone === "panel"
      ? { href: "/login", label: "Ir para o login" }
      : neutral
        ? null
        : { href: "/", label: "Voltar ao início" };

  return (
    <main
      className={
        neutral
          ? "flex min-h-screen items-center justify-center bg-white px-6 text-center"
          : "flex min-h-screen items-center justify-center bg-background px-6 text-center"
      }
    >
      <div className="w-full max-w-md">
        {!neutral && (
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.28em] text-brand">
            next disparos
          </p>
        )}
        <p className="text-6xl font-extrabold tracking-tight text-foreground">404</p>
        <h1 className="mt-3 text-xl font-semibold text-foreground">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço informado não existe ou não está disponível.
        </p>
        {cta && (
          <a
            href={cta.href}
            className="mt-7 inline-flex items-center justify-center rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-ink transition hover:brightness-105"
          >
            {cta.label}
          </a>
        )}
      </div>
    </main>
  );
}

export function useHostZone(): Zone | null {
  const [zone, setZone] = useState<Zone | null>(null);
  useEffect(() => {
    setZone(zoneForHost(window.location.hostname));
  }, []);
  return zone;
}
