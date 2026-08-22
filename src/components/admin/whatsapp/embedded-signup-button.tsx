import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageCircle, Smartphone, Info, ExternalLink, Copy } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { META_APP_ID, META_ES_CONFIG_ID } from "@/lib/meta/app-config";
import { PostSignupDialog } from "@/components/admin/whatsapp/post-signup-dialog";

export type OnboardingMode = "standard" | "coexistence";

type Props = {
  clientId?: string | null;
  projectId?: string | null;
  nomeInterno?: string;
  mode?: OnboardingMode;
  label?: string;
  variant?: "default" | "outline" | "secondary";
  onCompleted?: (r: {
    waba_ref_id: string;
    connection_id: string;
    display_phone_number: string | null;
    verified_name: string | null;
    status: string;
    onboarding_mode: OnboardingMode;
    coexistence_status?: string | null;
  }) => void;
  disabled?: boolean;
};

const STORAGE_KEY = "wa_es_pending";
const BC_NAME = "wa-es-done";

function buildOnboardUrl(mode: OnboardingMode): string {
  const extras: Record<string, unknown> = {
    sessionInfoVersion: "3",
    version: "v4",
    features: [],
  };
  if (mode === "coexistence") {
    extras.featureType = "whatsapp_business_app_onboarding";
  }
  const params = new URLSearchParams({
    app_id: META_APP_ID,
    config_id: META_ES_CONFIG_ID,
    extras: JSON.stringify(extras),
  });
  return `https://business.facebook.com/messaging/whatsapp/onboard/?${params.toString()}`;
}

export function EmbeddedSignupButton({
  clientId,
  projectId,
  nomeInterno,
  mode = "standard",
  label,
  variant = "default",
  onCompleted,
  disabled,
}: Props) {
  const [inIframe, setInIframe] = useState(false);
  const [openUrl, setOpenUrl] = useState("");
  const [finishedConnectionId, setFinishedConnectionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setInIframe(window.top !== window.self);
    } catch {
      setInIframe(true);
    }
    setOpenUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const ch = new BroadcastChannel(BC_NAME);
    ch.onmessage = (ev) => {
      if (ev.data?.type !== "WA_ES_DONE") return;
      setFinishedConnectionId(ev.data?.connection_id ?? null);
      onCompleted?.(ev.data);
    };
    return () => ch.close();
  }, [onCompleted]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Endereço copiado. Cole em uma nova aba do navegador.");
    } catch {
      toast.message(window.location.href, { duration: 12000 });
    }
  }

  const url = buildOnboardUrl(mode);

  function handleClick() {
    const pending = {
      clientId: clientId ?? null,
      projectId: projectId ?? null,
      nomeInterno: nomeInterno ?? null,
      mode,
      returnTo: window.location.pathname,
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    } catch {
      /* storage pode estar indisível em contextos restritos */
    }
  }

  const defaultLabel = mode === "coexistence" ? "Conectar sem remover do WhatsApp" : "Conectar WhatsApp";
  const Icon = mode === "coexistence" ? Smartphone : MessageCircle;

  return (
    <>
      <div className="space-y-2">
        {inIframe && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Abra em uma nova aba para conectar</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                A Meta não permite abrir o cadastro dentro do preview. Clique abaixo para sair do preview na mesma
                aba; depois clique em Conectar WhatsApp novamente para abrir o cadastro.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" size="sm" variant="outline">
                  <a href={openUrl || "#"} target="_top">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Sair do preview
                  </a>
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={copyUrl}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar endereço
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {inIframe ? (
          <Button asChild type="button" variant={variant} className={disabled ? "pointer-events-none opacity-50" : ""}>
            <a href={openUrl || "#"} target="_top">
              <Icon className="mr-2 h-4 w-4" />
              Sair do preview e conectar
              <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
            </a>
          </Button>
        ) : (
          <Button asChild type="button" variant={variant} className={disabled ? "pointer-events-none opacity-50" : ""}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleClick}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label ?? defaultLabel}
              <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
            </a>
          </Button>
        )}
      </div>
      <PostSignupDialog
        connectionId={finishedConnectionId}
        open={!!finishedConnectionId}
        onOpenChange={(v) => !v && setFinishedConnectionId(null)}
      />
    </>
  );
}
