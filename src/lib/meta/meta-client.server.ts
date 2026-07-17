/**
 * Cliente Meta Graph API (server-only).
 * Centraliza versão, timeout, parser de erros e chamadas HTTP.
 */

import { GRAPH_VERSION, GRAPH_BASE } from "@/lib/meta/graph-version";
export const META_GRAPH_VERSION = GRAPH_VERSION;
export const META_GRAPH = GRAPH_BASE;

export type MetaApiError = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  is_transient?: boolean;
};

export class MetaError extends Error {
  code?: number;
  subcode?: number;
  type?: string;
  fbtrace_id?: string;
  user_title?: string;
  user_msg?: string;
  is_transient?: boolean;
  http_status: number;
  endpoint: string;

  constructor(err: MetaApiError, http_status: number, endpoint: string) {
    const friendly = err.error_user_msg || err.message || `HTTP ${http_status}`;
    super(friendly);
    this.name = "MetaError";
    this.code = err.code;
    this.subcode = err.error_subcode;
    this.type = err.type;
    this.fbtrace_id = err.fbtrace_id;
    this.user_title = err.error_user_title;
    this.user_msg = err.error_user_msg;
    this.is_transient = err.is_transient;
    this.http_status = http_status;
    this.endpoint = endpoint;
  }

  toAuditPayload() {
    return {
      code: this.code ? String(this.code) : null,
      subcode: this.subcode ? String(this.subcode) : null,
      type: this.type ?? null,
      fbtrace_id: this.fbtrace_id ?? null,
      message: this.message,
    };
  }
}

function parseMetaError(json: any, status: number, endpoint: string): MetaError {
  const err = (json?.error ?? {}) as MetaApiError;
  return new MetaError(
    {
      message: err.message || `HTTP ${status}`,
      type: err.type,
      code: err.code,
      error_subcode: err.error_subcode,
      error_user_title: err.error_user_title,
      error_user_msg: err.error_user_msg,
      fbtrace_id: err.fbtrace_id,
      is_transient: err.is_transient,
    },
    status,
    endpoint,
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Tempo esgotado (${label})`)), ms),
    ),
  ]);
}

export async function metaFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<any> {
  const url = path.startsWith("http") ? path : `${META_GRAPH}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await withTimeout(fetch(url, init), init.timeoutMs ?? 25_000, url);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw parseMetaError(json, res.status, url);
  return json;
}

/** Chamada crua (retorna Response) para binary uploads. */
export async function metaFetchRaw(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${META_GRAPH}${path.startsWith("/") ? "" : "/"}${path}`;
  return await withTimeout(fetch(url, init), init.timeoutMs ?? 60_000, url);
}
