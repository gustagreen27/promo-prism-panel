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
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <img
            src={logoAsset.url}
            alt="next DISPAROS"
            className="h-12 w-auto object-contain brightness-110"
          />
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="identifier" className="text-zinc-300">E-mail ou usuário</Label>
            <Input
              id="identifier"
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              className="h-12 border-zinc-800 bg-zinc-950 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-600"
              placeholder="voce@empresa.com.br ou seu-usuario"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-12 border-zinc-800 bg-zinc-950 text-white placeholder:text-zinc-600 focus-visible:ring-zinc-600"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="h-12 w-full bg-white text-black hover:bg-zinc-200"
            disabled={loading || locked}
          >
            {locked ? "Aguarde 30s…" : loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
