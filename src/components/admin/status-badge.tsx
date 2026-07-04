import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Ban,
  Play,
  Pause,
  Loader2,
  Send,
} from "lucide-react";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const MAP: Record<string, { label: string; tone: Tone; Icon?: React.ComponentType<{ className?: string }> }> = {
  // WABA / connection
  ativo: { label: "Ativo", tone: "success", Icon: CheckCircle2 },
  inativo: { label: "Inativo", tone: "neutral", Icon: Ban },
  suspenso: { label: "Suspenso", tone: "danger", Icon: XCircle },
  aguardando_verificacao: { label: "Aguardando verificação", tone: "warning", Icon: Clock },
  pendente: { label: "Pendente", tone: "warning", Icon: Clock },
  erro: { label: "Erro", tone: "danger", Icon: XCircle },
  conectado: { label: "Conectado", tone: "success", Icon: CheckCircle2 },

  // template
  approved: { label: "Aprovado", tone: "success", Icon: CheckCircle2 },
  pending: { label: "Pendente", tone: "warning", Icon: Clock },
  rejected: { label: "Rejeitado", tone: "danger", Icon: XCircle },
  paused: { label: "Pausado", tone: "warning", Icon: Pause },
  disabled: { label: "Desativado", tone: "neutral", Icon: Ban },
  draft: { label: "Rascunho", tone: "neutral" },

  // campaign
  scheduled: { label: "Agendada", tone: "info", Icon: Clock },
  running: { label: "Em andamento", tone: "primary", Icon: Play },
  completed: { label: "Concluída", tone: "success", Icon: CheckCircle2 },
  cancelled: { label: "Cancelada", tone: "neutral", Icon: Ban },
  failed: { label: "Falhou", tone: "danger", Icon: XCircle },

  // recipient / message
  sent: { label: "Enviada", tone: "info", Icon: Send },
  delivered: { label: "Entregue", tone: "success", Icon: CheckCircle2 },
  read: { label: "Lida", tone: "success", Icon: CheckCircle2 },
  processing: { label: "Processando", tone: "info", Icon: Loader2 },

  // quality
  GREEN: { label: "Alta qualidade", tone: "success" },
  YELLOW: { label: "Qualidade média", tone: "warning" },
  RED: { label: "Baixa qualidade", tone: "danger" },
  UNKNOWN: { label: "Sem dados", tone: "neutral" },
};

const TONE_CLASS: Record<Tone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  primary: "border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const key = String(status ?? "").trim();
  const meta = MAP[key] ?? { label: key || "—", tone: "neutral" as Tone };
  const Icon = meta.Icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", TONE_CLASS[meta.tone], className)}
    >
      {Icon && <Icon className={cn("h-3 w-3", key === "processing" && "animate-spin")} />}
      {meta.label}
    </Badge>
  );
}

export function AlertBadge({ children, tone = "warning", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1", TONE_CLASS[tone], className)}>
      <AlertTriangle className="h-3 w-3" />
      {children}
    </Badge>
  );
}
