// Suporte a múltiplos destinos por campanha.
// A campanha mantém `destination_url` (destino principal, usado como fallback)
// e `destination_urls` (lista opcional de destinos extras com rótulo/peso).
// A rotação pode ser aleatória (ponderada) ou sequencial (round-robin).

export type CampaignDestination = {
  url: string;
  label?: string | null;
  weight?: number | null;
};

export type DestinationRotation = "random" | "sequential";

export const ROTATION_OPTIONS: { value: DestinationRotation; label: string; description: string }[] = [
  {
    value: "random",
    label: "Aleatório (ponderado)",
    description: "Cada acesso sorteia um destino respeitando o peso definido.",
  },
  {
    value: "sequential",
    label: "Sequencial (round-robin)",
    description: "Os acessos alternam entre os destinos, um após o outro.",
  },
];

export function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normaliza a lista de destinos extras vinda do formulário/banco. */
export function normalizeDestinations(raw: unknown): CampaignDestination[] {
  if (!Array.isArray(raw)) return [];
  const out: CampaignDestination[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = String((item as any).url ?? "").trim();
    if (!url || !isHttpUrl(url)) continue;
    const rawWeight = Number((item as any).weight);
    const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? Math.min(rawWeight, 1000) : 1;
    const label = String((item as any).label ?? "").trim();
    out.push({ url, label: label || null, weight });
  }
  return out;
}

/** Lista completa de destinos: principal + extras (deduplicada por URL). */
export function allDestinations(campaign: {
  destination_url?: string | null;
  destination_urls?: unknown;
}): CampaignDestination[] {
  const list: CampaignDestination[] = [];
  const primary = (campaign.destination_url ?? "").trim();
  if (primary) list.push({ url: primary, label: "Principal", weight: 1 });
  for (const d of normalizeDestinations(campaign.destination_urls)) {
    if (list.some((x) => x.url === d.url)) continue;
    list.push(d);
  }
  return list;
}

/**
 * Escolhe o destino de um acesso. `cursor` é usado apenas no modo sequencial
 * (valor incremental vindo do banco).
 */
export function pickDestination(
  campaign: { destination_url?: string | null; destination_urls?: unknown; destination_rotation?: string | null },
  cursor?: number | null,
): string {
  const list = allDestinations(campaign);
  if (list.length === 0) return (campaign.destination_url ?? "").trim();
  if (list.length === 1) return list[0].url;

  const rotation = (campaign.destination_rotation as DestinationRotation) ?? "random";
  if (rotation === "sequential") {
    const i = Math.abs(Number(cursor ?? 0)) % list.length;
    return list[i].url;
  }

  const total = list.reduce((s, d) => s + (d.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const d of list) {
    r -= d.weight ?? 1;
    if (r <= 0) return d.url;
  }
  return list[list.length - 1].url;
}
