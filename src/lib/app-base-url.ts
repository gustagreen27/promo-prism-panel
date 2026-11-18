// Endereço público do próprio painel, usado para ele chamar as próprias rotinas
// (fila de disparos etc.). Em servidor próprio, defina APP_BASE_URL
// (ex.: https://aagencianext.com). Sem ela, mantém o endereço antigo informado.
export function appBaseUrl(legacyFallback: string): string {
  const own = (process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return own || legacyFallback;
}
