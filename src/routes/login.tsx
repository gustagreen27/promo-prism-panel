import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyContext, logAuthEvent, resolveLoginEmail } from "@/lib/auth.functions";
import { AlertCircle } from "lucide-react";
import logoAsset from "@/assets/next-disparos-logo.png.asset.json";

const searchSchema = z.object({
  reason: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — next DISPAROS" },
      { name: "description", content: "Acesse o painel next DISPAROS." },
      { property: "og:title", content: "Entrar — next DISPAROS" },
      { property: "og:description", content: "Acesse o painel next DISPAROS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const ctxFn = useServerFn(getMyContext);
  const logFn = useServerFn(logAuthEvent);
  const resolveFn = useServerFn(resolveLoginEmail);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState<number>(0);

  useEffect(() => {
    if (search.reason === "no-access") setError("Sua conta não tem acesso ao painel. Fale com o administrador.");
    if (search.reason === "blocked") setError("Sua conta está suspensa. Entre em contato com o suporte.");
    if (search.reason === "session-expired") setError("Sua sessão expirou. Entre novamente.");
  }, [search.reason]);

  const locked = Date.now() < lockUntil;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading || locked) return;
    setError(null);
    setLoading(true);

    const raw = identifier.trim();
    let loginEmail = raw;
    if (!raw.includes("@")) {
      try {
        const res = await resolveFn({ data: { identifier: raw } });
        if (!res?.email) {
          setLoading(false);
          setError("Usuário ou e-mail não encontrado.");
          return;
        }
        loginEmail = res.email;
      } catch {
        setLoading(false);
        setError("Não foi possível validar o usuário. Tente novamente.");
        return;
      }
    }

    const { data, error: err } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (err || !data.user) {
      const nf = failCount + 1;
      setFailCount(nf);
      if (nf >= 5) setLockUntil(Date.now() + 30_000);
      setLoading(false);
      const msg = err?.message?.toLowerCase().includes("invalid") || err?.message?.toLowerCase().includes("credentials")
        ? "Usuário ou senha incorretos."
        : err?.message ?? "Não foi possível entrar.";
      setError(msg);
      logFn({ data: { type: "login_failed", metadata: { identifier: raw } } }).catch(() => {});
      return;
    }

    try {
      const ctx = await ctxFn();
      logFn({ data: { type: "login_success" } }).catch(() => {});
      setLoading(false);

      if (ctx.is_staff) {
        navigate({ to: "/admin" });
        return;
      }
      if (ctx.primary_workspace?.is_blocked) {
        await supabase.auth.signOut();
        setError("Sua conta está suspensa. Entre em contato com o suporte.");
        return;
      }
      const dest = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/painel";
      navigate({ to: dest });
    } catch {
      setLoading(false);
      navigate({ to: "/painel" });
    }
  }

  return (
    <div className="grid min-h-screen bg-ink lg:grid-cols-2">
      {/* Formulário */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <img src={logoAsset.url} alt="next DISPAROS" className="mb-10 h-11 w-auto object-contain brightness-110" />

          <h1 className="text-2xl font-semibold tracking-tight text-white">Acessar a plataforma</h1>
          <p className="mt-1.5 text-sm text-white/50">
            Entre com seu e-mail ou nome de usuário para continuar.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-white/70">E-mail ou usuário</Label>
              <Input
                id="identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/30 focus-visible:border-brand/60"
                placeholder="voce@empresa.com.br ou seu-usuario"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-12 rounded-xl border-white/10 bg-white/[0.04] pr-11 text-white placeholder:text-white/30 focus-visible:border-brand/60"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 transition hover:text-white/80"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link to="/recuperar-senha" className="text-xs font-medium text-brand hover:underline">
                Esqueci minha senha
              </Link>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="h-12 w-full rounded-xl bg-brand text-ink hover:bg-brand/90"
              disabled={loading || locked}
            >
              {locked ? "Aguarde 30s…" : loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </div>
      </div>

      {/* Preview institucional */}
      <div className="relative hidden overflow-hidden border-l border-white/5 bg-graphite lg:block">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-brand-dark/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center gap-8 px-14">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
            Plataforma operacional
          </div>
          <div>
            <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
              Comunicação em escala. Resultados em tempo real.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/50">
              Planeje campanhas, acompanhe o processamento e centralize toda a sua operação
              em uma plataforma preparada para grandes volumes.
            </p>
          </div>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {[
              { label: "Campanhas", value: "Centralizadas" },
              { label: "Status", value: "Tempo real" },
              { label: "Relatórios", value: "Detalhados" },
            ].map((i) => (
              <div key={i.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/40">{i.label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{i.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
