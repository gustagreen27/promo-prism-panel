// Autenticação dos endpoints internos chamados por pg_cron / self-chain.
// O segredo vive apenas no servidor (WA_CRON_SECRET) e no banco
// (public.app_cron_secret, lido pelo helper public.cron_headers).

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function cronSecret(): string {
  return process.env.WA_CRON_SECRET ?? "";
}

/** true quando a requisição traz o segredo interno correto. */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = cronSecret();
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("apikey") ??
    new URL(request.url).searchParams.get("cron_secret") ??
    "";
  return Boolean(provided) && safeEqual(provided, expected);
}

/** Resposta 401 padrão para chamadas não autorizadas. */
export function cronUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
