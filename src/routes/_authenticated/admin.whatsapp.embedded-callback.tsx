import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { completeEmbeddedSignup } from "@/lib/wa-embedded-signup.functions";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/embedded-callback")({
  head: () => ({ meta: [{ title: "Finalizando conexão — WhatsApp" }] }),
  component: Page,
});

const STORAGE_KEY = "wa_es_pending";
const BC_NAME = "wa-es-done";

type Status = "working" | "done" | "error";

function Page() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const completeFn = useServerFn(completeEmbeddedSignup);
  const [status, setStatus] = useState<Status>("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = (search as any)?.code as string | undefined;
    const waba_id = (search as any)?.waba_id as string | undefined;
    const phone_number_id = (search as any)?.phone_number_id as string | undefined;
    const business_id = (search as any)?.business_id as string | undefined;

    const pendingRaw = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    let pending: Record<string, any> = {};
    try {
      pending = pendingRaw ? JSON.parse(pendingRaw) : {};
    } catch {
      pending = {};
    }

    if (!code || !waba_id || !phone_number_id) {
      setStatus("error");
      setError("Parâmetros de onboarding incompletos. Tente iniciar o cadastro novamente.");
      return;
    }

    let cancelled = false;

    completeFn({
      data: {
        code,
        waba_id,
        phone_number_id,
        business_id: business_id ?? null,
        client_id: pending.clientId ?? null,
        project_id: pending.projectId ?? null,
        nome_interno: pending.nomeInterno ?? undefined,
        onboarding_mode: pending.mode ?? "standard",
      },
    })
      .then((result: any) => {
        if (cancelled) return;
        setStatus("done");
        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          const ch = new BroadcastChannel(BC_NAME);
          ch.postMessage({ type: "WA_ES_DONE", ...result });
          ch.close();
        }
        const returnTo =
          typeof pending.returnTo === "string" && pending.returnTo
            ? pending.returnTo
            : "/admin/whatsapp/conexoes";
        navigate({ to: returnTo, replace: true });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setStatus("error");
        setError(e?.message ?? "Falha ao concluir o onboarding.");
      });

    return () => {
      cancelled = true;
    };
  }, [search, navigate, completeFn]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {status === "working" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-5 text-xl font-semibold">Finalizando conexão</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Estamos trocando o código da Meta pelo token e salvando a WABA/número no painel.
            </p>
          </>
        )}
        {status === "done" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-5 text-xl font-semibold text-emerald-600">Conexão salva</h1>
            <p className="mt-2 text-sm text-muted-foreground">Você já pode fechar esta aba.</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-5 text-xl font-semibold text-destructive">Não foi possível conectar</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
