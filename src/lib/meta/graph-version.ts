/**
 * ÚNICA fonte da versão da Meta Graph API / WhatsApp Cloud API.
 * Para mudar de versão, altere apenas META_GRAPH_API_VERSION abaixo.
 * (Não lê variável de ambiente: no runtime do servidor o env não existe no
 * carregamento do módulo, o que fazia o sistema cair silenciosamente em v21.0.)
 */
export const META_GRAPH_API_VERSION = "v26.0";

export const GRAPH_VERSION: string = META_GRAPH_API_VERSION;

export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Mantido por compatibilidade: a versão salva em cada conexão é ignorada para
 * que toda chamada use a versão central.
 */
export function resolveGraphVersion(_connectionVersion?: string | null): string {
  return GRAPH_VERSION;
}
