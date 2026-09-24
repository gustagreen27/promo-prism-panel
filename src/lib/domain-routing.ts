/**
 * Roteamento e isolamento por domínio (fonte única de verdade).
 *
 * - nextdisparo.com          -> apenas o frontend institucional
 * - painel.nextdisparos.com  -> apenas login/recuperação + /painel/*
 * - metodovidacursos.com.br  -> apenas páginas públicas por slug (/:slug)
 * - disparosfr.com           -> único domínio com /admin/*
 *
 * Regras aplicadas no edge (src/server.ts) e reforçadas no cliente
 * (src/components/domain-guard.tsx) para navegações internas.
 */

export type Zone = "panel" | "site" | "admin" | "slug";

const HOST_ZONE: Record<string, Zone> = {
  "painel.nextdisparos.com": "panel",
  "nextdisparos.com": "panel",
  "www.nextdisparos.com": "panel",

  "nextdisparo.com": "site",
  "www.nextdisparo.com": "site",

  "disparosfr.com": "admin",
  "www.disparosfr.com": "admin",

  "metodovidacursos.com.br": "slug",
  "www.metodovidacursos.com.br": "slug",

  "acompanhamentofacil.app": "slug",
  "www.acompanhamentofacil.app": "slug",
};

/** Host canônico (sem www) de cada zona. */
export const ZONE_HOST: Record<Zone, string> = {
  panel: "painel.nextdisparos.com",
  site: "nextdisparo.com",
  admin: "disparosfr.com",
  slug: "metodovidacursos.com.br",
};

export function zoneForHost(host: string | null | undefined): Zone | null {
  if (!host) return null;
  const clean = host.toLowerCase().split(":")[0]!;
  return HOST_ZONE[clean] ?? null;
}

export function hostFromRequest(request: Request): string {
  const url = new URL(request.url);
  const raw =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return raw.toLowerCase().split(":")[0]!;
}

/**
 * Exceções técnicas: assets, APIs, webhooks, callbacks e arquivos do build.
 * Nunca são tratados como rota de interface nem como slug público.
 */
export function isTechnicalPath(pathname: string): boolean {
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_") || // /_serverFn, /_build, /__ etc.
    pathname.startsWith("/@") || // vite dev
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/src/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/sitemap") ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/service-worker.js"
  ) {
    return true;
  }
  // qualquer arquivo com extensão (js, css, png, woff2, mp4, ...)
  const last = pathname.split("/").pop() ?? "";
  return /\.[a-z0-9]{2,6}$/i.test(last);
}

/** Rotas de interface reais do projeto — nunca são slugs públicos. */
export const RESERVED_SLUGS = new Set<string>([
  // rotas existentes
  "admin",
  "login",
  "logout",
  "painel",
  "auth",
  "cadastro",
  "conformidade",
  "recuperar-senha",
  "reset-password",
  "relatorios",
  "campaigns",
  "site",
  "politica-de-privacidade",
  "politica2026",
  // reservas defensivas
  "api",
  "dashboard",
  "register",
  "configuracoes",
  "usuarios",
  "empresas",
  "campanhas",
  "creditos",
  "suporte",
  "contatos",
  "templates",
  "financeiro",
  "notificacoes",
  "demandas",
  "demanda",
  "assets",
  "static",
  "public",
]);

/** Caminhos de interface do site institucional. */
const SITE_ALLOWED = new Set([
  "/",
  // páginas legais linkadas no rodapé institucional
  "/politica-de-privacidade",
  "/conformidade",
]);

/** Caminhos de autenticação permitidos no domínio do painel. */
const PANEL_AUTH_ALLOWED = new Set([
  "/login",
  "/recuperar-senha",
  "/reset-password",
  "/auth",
  "/conformidade",
  "/politica-de-privacidade",
]);

export type DomainDecision =
  | { kind: "allow" }
  | { kind: "redirect"; location: string; status: 301 | 302 }
  | { kind: "notfound"; zone: Zone };

function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/** Decide o que fazer para um hostname + caminho. Fonte única das regras. */
export function decide(host: string, pathnameRaw: string, search = ""): DomainDecision {
  const zone = zoneForHost(host);
  if (!zone) return { kind: "allow" }; // preview/localhost/domínios não gerenciados

  const pathname = normalize(pathnameRaw);

  if (isTechnicalPath(pathname)) return { kind: "allow" };

  // www -> apex (301), preservando caminho e query
  const canonical = ZONE_HOST[zone];
  if (host !== canonical && host.startsWith("www.")) {
    return { kind: "redirect", location: `https://${canonical}${pathnameRaw}${search}`, status: 301 };
  }
  // nextdisparos.com (sem subdomínio) -> painel.nextdisparos.com
  if (zone === "panel" && host !== canonical) {
    return { kind: "redirect", location: `https://${canonical}${pathnameRaw}${search}`, status: 301 };
  }

  const segments = pathname.split("/").filter(Boolean);

  switch (zone) {
    case "site": {
      if (SITE_ALLOWED.has(pathname)) return { kind: "allow" };
      return { kind: "notfound", zone };
    }
    case "panel": {
      if (pathname === "") return { kind: "allow" };
      if (pathname === "/") {
        return { kind: "redirect", location: `https://${canonical}/login${search}`, status: 302 };
      }
      if (PANEL_AUTH_ALLOWED.has(pathname)) return { kind: "allow" };
      if (pathname === "/painel" || pathname.startsWith("/painel/")) return { kind: "allow" };
      return { kind: "notfound", zone };
    }
    case "slug": {
      if (segments.length !== 1) return { kind: "notfound", zone };
      if (RESERVED_SLUGS.has(segments[0]!.toLowerCase())) return { kind: "notfound", zone };
      return { kind: "allow" };
    }
    case "admin": {
      // domínio administrativo: mantém o comportamento existente
      return { kind: "allow" };
    }
  }
}

export function decideRequest(request: Request): DomainDecision {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { kind: "allow" };
  }
  return decide(hostFromRequest(request), url.pathname, url.search);
}
