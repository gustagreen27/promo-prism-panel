import type { Zone } from "./domain-routing";

type Copy = {
  brand: string;
  title: string;
  text: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

const COPY: Record<Zone, Copy> = {
  site: {
    brand: "next DISPAROS",
    title: "Página não encontrada",
    text: "O endereço informado não existe ou não está disponível.",
    ctaLabel: "Voltar ao início",
    ctaHref: "/",
  },
  panel: {
    brand: "next DISPAROS",
    title: "Página não encontrada",
    text: "O endereço informado não existe ou não está disponível.",
    ctaLabel: "Ir para o login",
    ctaHref: "/login",
  },
  slug: {
    brand: "",
    title: "Página não encontrada",
    text: "O endereço informado não existe ou não está disponível.",
    ctaLabel: null,
    ctaHref: null,
  },
  admin: {
    brand: "next DISPAROS",
    title: "Página não encontrada",
    text: "O endereço informado não existe ou não está disponível.",
    ctaLabel: "Voltar ao início",
    ctaHref: "/",
  },
};

export function renderDomain404(zone: Zone): string {
  const c = COPY[zone];
  const neutral = zone === "slug";
  const bg = neutral ? "#f7f7f8" : "#0b0d0c";
  const fg = neutral ? "#111827" : "#f5f7f6";
  const muted = neutral ? "#6b7280" : "#9aa3a0";
  const accent = "#25D366";

  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${c.title}</title>
<style>
  :root { color-scheme: ${neutral ? "light" : "dark"}; }
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    padding:24px;background:${bg};color:${fg};
    font-family:"Plus Jakarta Sans",Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .card{width:100%;max-width:440px;text-align:center}
  .brand{font-size:13px;letter-spacing:.28em;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:24px}
  .code{font-size:64px;font-weight:800;line-height:1;margin:0 0 12px;letter-spacing:-.03em}
  h1{font-size:22px;font-weight:600;margin:0 0 10px;letter-spacing:-.01em}
  p{margin:0;color:${muted};font-size:15px;line-height:1.6}
  a{display:inline-flex;align-items:center;justify-content:center;margin-top:28px;
    padding:12px 22px;border-radius:14px;background:${accent};color:#08110c;
    font-weight:600;font-size:14px;text-decoration:none}
  a:hover{filter:brightness(1.05)}
</style></head>
<body><main class="card">
  ${c.brand ? `<div class="brand">${c.brand}</div>` : ""}
  <div class="code">404</div>
  <h1>${c.title}</h1>
  <p>${c.text}</p>
  ${c.ctaHref ? `<a href="${c.ctaHref}">${c.ctaLabel}</a>` : ""}
</main></body></html>`;
}
