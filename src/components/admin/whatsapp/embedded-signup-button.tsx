import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Smartphone, Info, ExternalLink, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { getEmbeddedSignupConfig, completeEmbeddedSignup } from "@/lib/wa-embedded-signup.functions";
import { claimSharedWabaFn } from "@/lib/wa-claim-shared.functions";
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
  const claimFn = useServerFn(claimSharedWabaFn);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<{ appId: string; configId: string; graphVersion: string; sdkVersion?: string } | null>(null);
  const sessionRef = useRef<{ phone_number_id?: string; waba_id?: string; business_id?: string } | null>(null);
  /** True assim que a Meta envia qualquer evento do cadastro (popup abriu). */
  const metaSignalRef = useRef(false);
  const [finishedConnectionId, setFinishedConnectionId] = useState<string | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setInIframe(window.top !== window.self);
    } catch {
      // cross-origin access bloqueado => estamos em iframe
      setInIframe(true);
    }
  }, []);

  const [openUrl, setOpenUrl] = useState<string>("");
  useEffect(() => {
    setOpenUrl(window.location.href);
  }, []);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Endereço copiado. Cole em uma nova aba do navegador.");
    } catch {
      toast.message(window.location.href, { duration: 12000 });
    }
  }

  function openFallbackTab() {
    const tab = window.open(window.location.href, "_blank");
    if (!tab) {
      toast.error("A nova aba também foi bloqueada. Libere popups para este site e tente novamente.", {
        duration: 10000,
      });
      return;
    }
    try {
      tab.opener = null;
    } catch {
      /* a nova aba pode ter mudado de origem */
    }
    toast.message("A conexão foi aberta em uma nova aba. Clique em Conectar WhatsApp por lá.", {
      duration: 9000,
    });
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
    let pollId: number | undefined;
    let timeoutId: number | undefined;
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
      setSdkError(false);
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
    // Se outra tela já inseriu o script, acompanhe o carregamento dela. Antes o
    // componente apenas detectava a tag e ficava eternamente com `ready=false`.
    let script = document.querySelector<HTMLScriptElement>(
      'script[src*="connect.facebook.net"][src*="sdk.js"]',
    );
    if (!script) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(s);
      script = s;
    }
    const handleLoad = () => initFB();
    const handleError = () => {
      if (!cancelled) {
        setSdkError(true);
        setReady(false);
      }
    };
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    // O evento load pode ter ocorrido antes deste componente montar. Uma
    // sondagem curta cobre esse caso sem adicionar uma segunda cópia do SDK.
    pollId = window.setInterval(() => {
      if (window.FB) {
        initFB();
        if (pollId) window.clearInterval(pollId);
      }
    }, 250);
    timeoutId = window.setTimeout(() => {
      if (!cancelled && !window.FB) {
        setSdkError(true);
        setReady(false);
      }
      if (pollId) window.clearInterval(pollId);
    }, 12_000);
    return () => {
      cancelled = true;
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      if (pollId) window.clearInterval(pollId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [cfg]);


  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!isFacebookOrigin(ev.origin)) return;
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
        // Qualquer sinal da Meta prova que o popup abriu: desarma o alerta de
        // "popup bloqueado" e evita mensagens falsas enquanto o cliente
        // preenche o cadastro (que pode levar vários minutos).
        metaSignalRef.current = true;
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
    setLaunchError(null);
    // Este ramo é apenas uma proteção para chamadas programáticas. No preview,
    // o controle renderizado abaixo é um link target=_top, pois o contêiner pode
    // bloquear tanto window.open quanto links target=_blank.
    if (inIframe) {
      window.top?.location.assign(window.location.href);
      return;
    }

    if (!cfg) {
      toast.error("A configuração da Meta ainda não foi carregada. Aguarde e tente novamente.");
      return;
    }
    if (!window.FB || !ready) {
      toast.error(
        sdkError
          ? "O navegador bloqueou o cadastro da Meta. Desative o bloqueador para este site, recarregue a página e tente novamente."
          : "O cadastro da Meta ainda está carregando. Aguarde alguns segundos e tente novamente.",
        { duration: 9000 },
      );
      return;
    }

    sessionRef.current = null;
    setLoading(true);


    // Mantenha os extras exatamente no formato suportado pelo fluxo escolhido.
    // `app_only_install` pertence a outro fluxo e faz algumas configurações de
    // Embedded Signup encerrarem silenciosamente antes de abrir o popup.
    const extras: Record<string, string> = { sessionInfoVersion: "3" };
    if (mode === "coexistence") {
      extras.featureType = "whatsapp_business_app_onboarding";
    }

    // Watchdog: se nem o popup nem um callback responderem, libera o botão
    // rapidamente em vez de deixá-lo girando por vários minutos.
    // NÃO cancela nem interfere no callback real: apenas destrava o `loading`.
    let done = false;
    metaSignalRef.current = false;
    // Só acusa bloqueio de popup se a Meta não deu NENHUM sinal em 25s. Depois
    // do primeiro sinal o cadastro fica livre para durar o tempo que precisar.
    const watchdog = window.setInterval(() => {
      if (done) {
        window.clearInterval(watchdog);
        return;
      }
      if (metaSignalRef.current) {
        window.clearInterval(watchdog);
        return;
      }
      window.clearInterval(watchdog);
      setLoading(false);
      setLaunchError("A Meta não abriu o cadastro. O navegador pode ter bloqueado o popup.");
      toast.error("A Meta não abriu o cadastro. Libere popups para este site e tente novamente.", {
        duration: 10000,
      });
    }, 25 * 1000);

    const processLoginResponse = async (resp: any) => {
        try {
          const code = resp?.authResponse?.code;
          const sess = sessionRef.current;
          if (!code) {
            // A Meta às vezes conclui o cadastro sem devolver o código de
            // autorização. Nesse caso a conta já foi compartilhada com a nossa
            // BM, então importamos direto pelo WABA ID informado no fluxo.
            if (sess?.waba_id) {
              const claimed = await claimFn({
                data: {
                  waba_id: sess.waba_id,
                  nome_interno: nomeInterno ?? null,
                  client_id: clientId ?? null,
                  project_id: projectId ?? null,
                },
              });
              toast.success("Conta conectada e importada para o sistema.");
              onCompleted?.({
                waba_ref_id: (claimed as any)?.waba_ref_id ?? "",
                connection_id: (claimed as any)?.connection_id ?? "",
                display_phone_number: (claimed as any)?.display_phone_number ?? null,
                verified_name: (claimed as any)?.verified_name ?? null,
                status: "ativo",
                onboarding_mode: mode,
              });
              return;
            }
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
          // Última tentativa: se a conta já foi compartilhada com a nossa BM
          // durante o cadastro, importa por WABA ID em vez de perder o trabalho.
          const wabaId = sessionRef.current?.waba_id;
          if (wabaId) {
            try {
              const claimed = await claimFn({
                data: {
                  waba_id: wabaId,
                  nome_interno: nomeInterno ?? null,
                  client_id: clientId ?? null,
                  project_id: projectId ?? null,
                },
              });
              toast.success("Conta conectada e importada para o sistema.");
              onCompleted?.({
                waba_ref_id: (claimed as any)?.waba_ref_id ?? "",
                connection_id: (claimed as any)?.connection_id ?? "",
                display_phone_number: (claimed as any)?.display_phone_number ?? null,
                verified_name: (claimed as any)?.verified_name ?? null,
                status: "ativo",
                onboarding_mode: mode,
              });
              return;
            } catch {
              /* mantém a mensagem de erro original abaixo */
            }
          }
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
          window.clearInterval(watchdog);
          setLoading(false);
        }
      };

    // O SDK da Meta valida o callback com typeof estrito e rejeita funções
    // async ("Expression is of type asyncfunction, not function").
    function handleLoginResponse(resp: any) {
      void processLoginResponse(resp);
    }

    try {
      window.FB.login(handleLoginResponse, {
        config_id: cfg.configId,
        response_type: "code",
        override_default_response_type: true,
        extras,
      });
    } catch (error: any) {
      done = true;
      window.clearInterval(watchdog);
      setLoading(false);
      const message = error?.message ?? "O popup da Meta não pôde ser aberto.";
      setLaunchError(message);
      toast.error(`Meta: ${message}`, { duration: 10000 });
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
          <Button onClick={launch} disabled={disabled || loading} type="button" variant={variant}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
            {label ?? defaultLabel}
          </Button>
        )}
        {!inIframe && launchError && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Não foi possível abrir o cadastro</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{launchError}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={launch} disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Tentar novamente
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={openFallbackTab}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir em nova aba
                </Button>
              </div>
            </AlertDescription>
          </Alert>
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
