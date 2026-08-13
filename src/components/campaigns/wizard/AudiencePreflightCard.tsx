import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { audiencePreflight } from "@/lib/wa-failures.functions";
import { ClipboardCheck } from "lucide-react";

type Line = { label: string; value: number; tone?: "muted" | "warn" | "ok" };

/** Conferência da base antes do disparo: o que entra, o que é descartado e por quê. */
export function AudiencePreflightCard({ listId }: { listId: string | null | undefined }) {
  const run = useServerFn(audiencePreflight);
  const q = useQuery({
    queryKey: ["wa-audience-preflight", listId],
    queryFn: () => run({ data: { list_id: listId! } }),
    enabled: !!listId,
    staleTime: 60_000,
  });

  if (!listId) return null;

  const d = q.data;
  const lines: Line[] = [
    { label: "Importados", value: d?.imported ?? 0, tone: "muted" },
    { label: "Telefones inválidos", value: d?.invalid_phone ?? 0, tone: "warn" },
    { label: "Duplicados removidos", value: d?.duplicates_removed ?? 0, tone: "warn" },
    { label: "Opt-out do contato", value: d?.contact_opt_out ?? 0, tone: "warn" },
    { label: "Opt-out global", value: d?.global_opt_out ?? 0, tone: "warn" },
    { label: "Na supressão global", value: d?.suppressed ?? 0, tone: "warn" },
  ];

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck className="h-4 w-4" />
        Conferência da base
      </div>
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Analisando lista…</p>
      ) : q.error ? (
        <p className="text-xs text-muted-foreground">Não foi possível conferir a base agora.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {lines.map((l) => (
              <li key={l.label} className="flex items-center justify-between text-xs">
                <span className={l.tone === "warn" && l.value > 0 ? "text-destructive" : "text-muted-foreground"}>
                  {l.label}
                </span>
                <span className="font-medium tabular-nums">{l.value.toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm">
            <span className="font-semibold">Vão receber</span>
            <span className="font-bold tabular-nums text-primary">
              {(d?.eligible ?? 0).toLocaleString("pt-BR")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
