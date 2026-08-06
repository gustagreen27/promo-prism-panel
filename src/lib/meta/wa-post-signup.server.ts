/**
 * Helpers server-only para a etapa de pós-cadastro (após o Embedded Signup).
 * Concentra as chamadas ao Graph que alimentam a checklist final de integração.
 */
import { GRAPH_BASE as GRAPH } from "@/lib/meta/graph-version";

export type CheckState = "ok" | "pending" | "error" | "unknown";

export type ChecklistItem = {
  key: string;
  label: string;
  state: CheckState;
  detail?: string | null;
  /** Item informativo: não impede o uso do número. */
  optional?: boolean;
};

export function graphFetch(token: string, path: string, init?: RequestInit) {
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
}

export async function graphJson(token: string, path: string, init?: RequestInit) {
  const res = await graphFetch(token, path, init);
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export function graphError(json: any, fallback: string): string {
  return json?.error?.error_user_msg || json?.error?.message || fallback;
}

/** Considera "perfil preenchido" quando há descrição/about e pelo menos um contato/site. */
export function profileCompleteness(profile: any): { filled: number; total: number; missing: string[] } {
  const fields: Array<[string, boolean]> = [
    ["Recado (about)", !!profile?.about],
    ["Descrição", !!profile?.description],
    ["E-mail", !!profile?.email],
    ["Site", Array.isArray(profile?.websites) && profile.websites.length > 0],
    ["Categoria", !!profile?.vertical],
    ["Foto de perfil", !!profile?.profile_picture_url],
  ];
  const missing = fields.filter(([, v]) => !v).map(([k]) => k);
  return { filled: fields.length - missing.length, total: fields.length, missing };
}
