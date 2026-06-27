export type Campaign = {
  description: string;
  sent: number;
  failed: number;
  pricePerMsg: number;
};

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtNum = (n: number) => n.toLocaleString("pt-BR");

export const fmtPct = (n: number) =>
  `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")}%`;

export function computeCampaign(c: Campaign) {
  const sent = Math.max(0, Math.floor(c.sent || 0));
  const failed = Math.max(0, Math.min(sent, Math.floor(c.failed || 0)));
  const delivered = sent - failed;
  const rate = sent > 0 ? (delivered / sent) * 100 : 0;
  const gross = sent * (c.pricePerMsg || 0);
  const discount = failed * (c.pricePerMsg || 0);
  const net = delivered * (c.pricePerMsg || 0);
  return { sent, failed, delivered, rate, gross, discount, net };
}

export function computeTotals(campaigns: Campaign[]) {
  const t = campaigns.reduce(
    (acc, c) => {
      const r = computeCampaign(c);
      acc.sent += r.sent;
      acc.failed += r.failed;
      acc.delivered += r.delivered;
      acc.gross += r.gross;
      acc.discount += r.discount;
      acc.net += r.net;
      return acc;
    },
    { sent: 0, failed: 0, delivered: 0, gross: 0, discount: 0, net: 0, pending: 0, batches: campaigns.length },
  );
  const rate = t.sent > 0 ? (t.delivered / t.sent) * 100 : 0;
  return { ...t, rate };
}

export function applyFinalValue(
  totals: ReturnType<typeof computeTotals>,
  finalValue: number | null | undefined,
) {
  if (finalValue == null || !Number.isFinite(finalValue) || finalValue <= 0) {
    return { ...totals, finalValue: null as number | null, effectivePricePerMsg: totals.delivered > 0 ? totals.net / totals.delivered : 0 };
  }
  const effectivePricePerMsg = totals.delivered > 0 ? finalValue / totals.delivered : 0;
  const gross = totals.sent * effectivePricePerMsg;
  const discount = totals.failed * effectivePricePerMsg;
  return {
    ...totals,
    gross,
    discount,
    net: finalValue,
    finalValue,
    effectivePricePerMsg,
  };
}

export function formatBRDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatBRDateTime(d: Date) {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
