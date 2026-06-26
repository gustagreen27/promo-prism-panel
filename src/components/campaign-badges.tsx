import { Badge } from "@/components/ui/badge";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-foreground" },
  active: { label: "Ativa", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  paused: { label: "Pausada", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  archived: { label: "Arquivada", className: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const v = STATUS_MAP[status ?? "draft"] ?? STATUS_MAP.draft;
  return <Badge variant="secondary" className={v.className}>{v.label}</Badge>;
}

export function IntentScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return <Badge variant="outline">Sem análise</Badge>;
  }
  const cls =
    score >= 80
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
      : score >= 50
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
        : "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100";
  return <Badge variant="secondary" className={cls}>Intenção: {score}/100</Badge>;
}
