import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncSharedWabasFn } from "@/lib/wa-sync-shared.functions";

const PENDING_KEY = "wa_es_pending";

type Props = {
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  onSynced?: () => void;
};

export function SyncSharedWabasButton({ label = "Sincronizar conexões", variant = "outline", onSynced }: Props) {
  const syncFn = useServerFn(syncSharedWabasFn);
  const [auto, setAuto] = useState(false);
  const autoDone = useRef(false);

  const mut = useMutation({
    mutationFn: () => syncFn({ data: {} }),
    onSuccess: (r: any) => {
      const novos = (r?.imported ?? []).filter((i: any) => i.created).length;
      const total = r?.imported?.length ?? 0;
      if (total === 0) {
        toast.message("Nenhuma conta compartilhada encontrada na Meta.", {
          description: r?.skipped?.[0]?.reason ?? undefined,
        });
      } else {
        toast.success(
          novos > 0
            ? `${novos} nova(s) conta(s) importada(s) · ${total} sincronizada(s)`
            : `${total} conta(s) sincronizada(s)`,
        );
      }
      if (r?.skipped?.length) {
        toast.warning(`${r.skipped.length} conta(s) não puderam ser importadas`, {
          description: r.skipped[0]?.reason,
        });
      }
      onSynced?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao sincronizar contas da Meta"),
  });

  // Após o onboarding hospedado da Meta (nova aba), sincroniza automaticamente
  // quando o usuário volta para esta página.
  useEffect(() => {
    function maybeSync() {
      if (autoDone.current || document.visibilityState !== "visible") return;
      let pending = false;
      try {
        pending = !!sessionStorage.getItem(PENDING_KEY);
      } catch {
        pending = false;
      }
      if (!pending) return;
      autoDone.current = true;
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* noop */
      }
      setAuto(true);
      mut.mutate(undefined, { onSettled: () => setAuto(false) });
    }
    maybeSync();
    document.addEventListener("visibilitychange", maybeSync);
    window.addEventListener("focus", maybeSync);
    return () => {
      document.removeEventListener("visibilitychange", maybeSync);
      window.removeEventListener("focus", maybeSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = mut.isPending || auto;

  return (
    <Button type="button" variant={variant} disabled={busy} onClick={() => mut.mutate()}>
      <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Sincronizando…" : label}
    </Button>
  );
}
