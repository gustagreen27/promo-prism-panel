/**
 * Roteamento por domínio.
 *
 * - painel.nextdisparos.com  -> apenas /painel/*
 * - nextdisparo.com          -> apenas o site institucional
 * - disparosfr.com           -> único domínio com /admin/*
 * - metodovidacursos.com.br  -> páginas públicas dinâmicas por slug
 *
 * Qualquer rota acessada em domínio incorreto é redirecionada (301)
 * para o domínio correspondente, preservando caminho e query string.
 */

export type Zone = "panel" | "site" | "admin" | "slug" | "shared";

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
};

const ZONE_HOST: Record<Exclude<Zone, "shared">, string> = {
  panel: "painel.nextdisparos.com",
  site: "nextdisparo.com",
  admin: "disparosfr.com",
  slug: "metodovidacursos.com.br",
};

/** Caminhos que funcionam em qualquer domínio (auth, APIs, assets, links públicos). */
const SHARED_PREFIXES = [
  "/api/",
  "/_",
  "/assets/",
  "/favicon",
  "/robots.txt",
  "/sitemap",
  "/login",
  "/auth",
  "/cadastro",
  "/recuperar-senha",
  "/reset-password",
  "/relatorios/",
  "/campaigns/",
  "/conformidade",
  "/politica",
];

/** Caminhos do site institucional. */
const SITE_PATHS = new Set(["/", "/site"]);

export function zoneForPath(pathname: string): Zone {
  if (SHARED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return "shared";
  if (pathname === "/painel" || pathname.startsWith("/painel/")) return "panel";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (SITE_PATHS.has(pathname)) return "site";
  // rota dinâmica por slug (/nome-da-pagina)
  return "slug";
}

/**
 * Retorna a URL de redirecionamento quando o domínio não é o dono da rota,
 * ou null quando o acesso é permitido.
 */
export function domainRedirect(request: Request): string | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  const host = (request.headers.get("host") ?? url.host).toLowerCase().split(":")[0];
  const hostZone = HOST_ZONE[host];
  if (!hostZone) return null; // preview/localhost/domínios não gerenciados: sem restrição

  // Raiz do domínio do painel sempre aponta para /login no mesmo domínio
  if (hostZone === "panel" && url.pathname === "/") {
    return `https://${host}/login${url.search}`;
  }

  const pathZone = zoneForPath(url.pathname);
  if (pathZone === "shared" || pathZone === hostZone) return null;

  const target = ZONE_HOST[pathZone];
  if (!target || target === host) return null;

  return `https://${target}${url.pathname}${url.search}`;
}
