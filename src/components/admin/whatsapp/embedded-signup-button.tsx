import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Smartphone, Info, ExternalLink } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { getEmbeddedSignupConfig, completeEmbeddedSignup } from "@/lib/wa-embedded-signup.functions";
import { PostSignupDialog } from "@/components/admin/whatsapp/post-signup-dialog";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

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

// Meta pode usar múltiplos hosts do Facebook para postar o resultado do ES.
// Aceita qualquer subdomínio de facebook.com em https:// (padrão do sample oficial).
function isFacebookOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && (u.hostname === "facebook.com" || u.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

/**
 * Meta Embedded Signup button. Supports two modes:
 * - "standard": adds a brand-new number to WhatsApp Cloud API.
 * - "coexistence": connects a number that is already in use on the WhatsApp Business app
 *   (featureType=whatsapp_business_app_onboarding, sessionInfoVersion=3).
 */
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
  const cfgFn = useServerFn(getEmbeddedSignupConfig);
  const completeFn = useServerFn(completeEmbeddedSignup);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<{ appId: string; configId: string; graphVersion: string; sdkVersion?: string } | null>(null);
  const sessionRef = useRef<{ phone_number_id?: string; waba_id?: string; business_id?: string } | null>(null);
  const [finishedConnectionId, setFinishedConnectionId] = useState<string | null>(null);
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    try {
      setInIframe(window.top !== window.self);
    } catch {
      // cross-origin access bloqueado => estamos em iframe
      setInIframe(true);
    }
  }, []);

  function openInNewTab() {
    // Keep this call directly inside the user's click handler so popup blockers
    // recognise it as a user-initiated navigation. `noopener` in the features
    // string makes some browsers return `null` even when the tab did open.
    const w = window.open(window.location.href, "_blank");
    if (!w) {
      toast.message("Não foi possível abrir a nova aba. Copie o endereço e abra manualmente no navegador.", {
        duration: 9000,
      });
      return;
    }
    try {
      w.opener = null;
    } catch {
      /* the new tab may already be cross-origin */
    }
  }

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

  useEffect(() => {
    if (!cfg) return;
    let cancelled = false;
    const initFB = () => {
      if (cancelled || !window.FB) return;
      // FB.init is idempotent per appId+version — safe to call again after HMR/remount.
      window.FB.init({
        appId: cfg.appId,
        cookie: true,
        xfbml: true,
        autoLogAppEvents: true,
        version: cfg.sdkVersion || cfg.graphVersion,
      });
      setReady(true);
    };
    if (window.FB) {
      initFB();
      return () => {
        cancelled = true;
      };
    }
    // Chain onto any existing fbAsyncInit instead of clobbering it (other consumers may rely on it).
    const prev = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      try {
        prev?.();
      } catch {
        /* ignore other consumers' errors */
      }
      initFB();
    };
    const id = "facebook-jssdk";
    // Nunca carrega duas versões do SDK: checa o id e qualquer script já presente.
    const alreadyLoaded =
      !!document.getElementById(id) ||
      !!document.querySelector('script[src*="connect.facebook.net"][src*="sdk.js"]');
    if (!alreadyLoaded) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.onerror = () => {
        if (!cancelled) toast.error("Não foi possível carregar o cadastro da Meta. Verifique bloqueadores de conteúdo e tente novamente.");
      };
      document.body.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, [cfg]);


  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!isFacebookOrigin(ev.origin)) return;
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          sessionRef.current = {
            phone_number_id: data.data?.phone_number_id,
            waba_id: data.data?.waba_id,
            business_id: data.data?.business_id,
          };
        } else if (data.event === "CANCEL") {
          // A Meta informa em qual etapa o usuário abandonou o fluxo.
          const step = data.data?.current_step as string | undefined;
          sessionRef.current = null;
          toast.message(
            step
              ? `Cadastro cancelado na etapa: ${step.replaceAll("_", " ").toLowerCase()}`
              : "Cadastro incorporado cancelado.",
          );
        } else if (data.event === "ERROR") {
          toast.error(`Meta: ${data.data?.error_message ?? "Erro no Embedded Signup"}`);
        }
      } catch {
        /* ignore non-JSON messages */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function launch() {
    // O Embedded Signup abre um popup do Facebook. Dentro do iframe do preview
    // o navegador bloqueia esse popup (e a Meta não permite o fluxo em iframe),
    // então nada acontece ao clicar. Abrimos a página em uma aba real.
    if (inIframe) {
      openInNewTab();
      toast.message(
        "O Cadastro incorporado da Meta não funciona dentro do preview. Abrimos a página em uma nova aba — conclua por lá.",
        { duration: 9000 },
      );
      return;
    }

    if (!cfg) {
      toast.error("A configuração da Meta ainda não foi carregada. Aguarde e tente novamente.");
      return;
    }
    if (!window.FB || !ready) {
      toast.error("O cadastro da Meta ainda está carregando. Verifique bloqueadores de conteúdo e tente novamente.");
      return;
    }

    sessionRef.current = null;
    setLoading(true);


    // Extras: NUNCA envia setup:{} ou featureType:"" — Meta rejeita chaves vazias
    // silenciosamente e o sample oficial só inclui essas chaves quando têm valor real.
    // Config validada no painel da Meta: version v4, sessionInfoVersion 3,
    // features [app_only_install], featureType apenas no fluxo de coexistência.
    const extras: Record<string, any> = {
      sessionInfoVersion: "3",
      version: "v4",
      features: [{ name: "app_only_install" }],
    };
    if (mode === "coexistence") {
      extras.featureType = "whatsapp_business_app_onboarding";
    }

    // Watchdog do popup: se o callback do FB não disparar em 5min (usuário fechou
    // a janela sem CANCEL, bloqueador de popup, extensão etc.), libera o botão.
    // NÃO cancela nem interfere no callback real: apenas destrava o `loading`.
    let done = false;
    const watchdog = window.setTimeout(() => {
      if (!done) {
        setLoading(false);
        toast.message("O popup do Facebook não respondeu em 5 minutos. Tente novamente.");
      }
    }, 5 * 60 * 1000);

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
            toast.error(
              mode === "coexistence"
                ? "Onboarding incompleto: selecione a WABA e o número existente no WhatsApp Business para concluir."
                : "Onboarding incompleto: WABA/número não retornados. Refaça o fluxo escolhendo/criando um número.",
            );
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
              onboarding_mode: mode,
            },
          });
          const suffix =
            result.onboarding_mode === "coexistence" && result.coexistence_status === "attention_required"
              ? " (com pendências)"
              : "";
          toast.success(
            `Conectado: ${result.display_phone_number ?? result.verified_name ?? "número"} (${result.status})${suffix}`,
          );
          setFinishedConnectionId(result.connection_id);
          onCompleted?.(result);
        } catch (e: any) {
          const msg: string = e?.message ?? "Falha ao concluir onboarding";
          if (/já está registrado|already registered|Phone number in use/i.test(msg) && mode === "standard") {
            toast.error(
              "Este número já está sendo utilizado no WhatsApp. Use a opção “Conectar WhatsApp Business existente” (Coexistência).",
              { duration: 8000 },
            );
          } else {
            toast.error(msg);
          }
        } finally {
          done = true;
          window.clearTimeout(watchdog);
          setLoading(false);
        }
      },
      {
        config_id: cfg.configId,
        response_type: "code",
        override_default_response_type: true,
        extras,
      },
    );
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
                O Cadastro Incorporado da Meta abre uma janela do Facebook e não é permitido dentro do preview
                (a página está em um quadro embutido). Por isso o popup é bloqueado e nada acontece ao clicar.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={openInNewTab}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir em nova aba
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={launch} disabled={disabled || (!inIframe && !ready) || loading} type="button" variant={variant}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
          {label ?? defaultLabel}
        </Button>
      </div>
      <PostSignupDialog
        connectionId={finishedConnectionId}
        open={!!finishedConnectionId}
        onOpenChange={(v) => !v && setFinishedConnectionId(null)}
      />
    </>
  );
}
