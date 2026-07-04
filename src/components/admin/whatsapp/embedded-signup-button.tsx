import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle } from "lucide-react";
import { getEmbeddedSignupConfig, completeEmbeddedSignup } from "@/lib/wa-embedded-signup.functions";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

type Props = {
  clientId?: string | null;
  projectId?: string | null;
  nomeInterno?: string;
  onCompleted?: (r: { waba_ref_id: string; connection_id: string; display_phone_number: string | null; verified_name: string | null; status: string }) => void;
  disabled?: boolean;
};

/**
 * "Conectar WhatsApp" — Meta Embedded Signup (Facebook Login for Business).
 * Uses FB.login with the app's Configuration ID; captures session_info via postMessage;
 * exchanges the returned `code` on the backend and upserts WABA + connection.
 */
export function EmbeddedSignupButton({ clientId, projectId, nomeInterno, onCompleted, disabled }: Props) {
  const cfgFn = useServerFn(getEmbeddedSignupConfig);
  const completeFn = useServerFn(completeEmbeddedSignup);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<{ appId: string; configId: string; graphVersion: string } | null>(null);
  const sessionRef = useRef<{ phone_number_id?: string; waba_id?: string; business_id?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await cfgFn();
        setCfg(c);
      } catch (e: any) {
        toast.error(e?.message ?? "Configuração da Meta indisponível");
      }
    })();
  }, [cfgFn]);

  // Load FB SDK once cfg is available
  useEffect(() => {
    if (!cfg) return;
    if (window.FB) {
      window.FB.init({ appId: cfg.appId, cookie: true, xfbml: false, version: cfg.graphVersion });
      setReady(true);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: cfg.appId, cookie: true, xfbml: false, version: cfg.graphVersion });
      setReady(true);
    };
    const id = "facebook-jssdk";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(s);
    }
  }, [cfg]);

  // Capture session_info via postMessage from facebook.com
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== "https://www.facebook.com" && ev.origin !== "https://web.facebook.com") return;
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP") {
          if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
            sessionRef.current = {
              phone_number_id: data.data?.phone_number_id,
              waba_id: data.data?.waba_id,
              business_id: data.data?.business_id,
            };
          } else if (data.event === "CANCEL") {
            sessionRef.current = null;
          } else if (data.event === "ERROR") {
            toast.error(`Meta: ${data.data?.error_message ?? "Erro no Embedded Signup"}`);
          }
        }
      } catch {
        /* ignore non-JSON messages */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function launch() {
    if (!window.FB || !cfg) return;
    sessionRef.current = null;
    setLoading(true);
    window.FB.login(
      async (resp: any) => {
        try {
          const code = resp?.authResponse?.code;
          const sess = sessionRef.current;
          if (!code) {
            if (resp?.status === "not_authorized" || resp?.status === "unknown") {
              toast.error("Login cancelado ou não autorizado.");
            } else {
              toast.error("Nenhum código retornado pela Meta.");
            }
            return;
          }
          if (!sess?.waba_id || !sess?.phone_number_id) {
            toast.error("Onboarding incompleto: WABA/número não retornados. Refaça o fluxo escolhendo/criando um número.");
            return;
          }
          const result = await completeFn({
            data: {
              code,
              waba_id: sess.waba_id,
              phone_number_id: sess.phone_number_id,
              business_id: sess.business_id ?? null,
              client_id: clientId ?? null,
              project_id: projectId ?? null,
              nome_interno: nomeInterno,
            },
          });
          toast.success(`Conectado: ${result.display_phone_number ?? result.verified_name ?? "número"} (${result.status})`);
          onCompleted?.(result);
        } catch (e: any) {
          toast.error(e?.message ?? "Falha ao concluir onboarding");
        } finally {
          setLoading(false);
        }
      },
      {
        config_id: cfg.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  }

  return (
    <Button onClick={launch} disabled={disabled || !ready || loading} type="button">
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
      Conectar WhatsApp
    </Button>
  );
}
