export type PeriodKey =
  | "all"
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "custom";

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
  key: PeriodKey;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function getPeriodRange(key: PeriodKey, custom?: { start?: Date; end?: Date }): PeriodRange {
  const now = new Date();
  switch (key) {
    case "today":
      return { key, label: "Hoje", start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { key, label: "Ontem", start: startOfDay(y), end: endOfDay(y) };
    }
    case "last_7": {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { key, label: "Últimos 7 dias", start: startOfDay(s), end: endOfDay(now) };
    }
    case "last_30": {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { key, label: "Últimos 30 dias", start: startOfDay(s), end: endOfDay(now) };
    }
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { key, label: "Este mês", start: startOfDay(s), end: endOfDay(now) };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { key, label: "Mês passado", start: startOfDay(s), end: endOfDay(e) };
    }
    case "custom":
      return {
        key,
        label: "Personalizado",
        start: startOfDay(custom?.start ?? now),
        end: endOfDay(custom?.end ?? now),
      };
  }
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "last_7", label: "Últimos 7 dias" },
  { key: "last_30", label: "Últimos 30 dias" },
  { key: "this_month", label: "Este mês" },
  { key: "last_month", label: "Mês passado" },
  { key: "custom", label: "Personalizado" },
];
