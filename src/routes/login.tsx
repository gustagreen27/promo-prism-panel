import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { getMyContext, logAuthEvent } from "@/lib/auth.functions";
import { AlertCircle } from "lucide-react";

const searchSchema = z.object({
  reason: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Entrar — Disparos FR" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const ctxFn = useServerFn(getMyContext);
  const logFn = useServerFn(logAuthEvent);
  const [email, setEmail] = useState("");
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
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err || !data.user) {
      const nf = failCount + 1;
      setFailCount(nf);
      if (nf >= 5) setLockUntil(Date.now() + 30_000);
      setLoading(false);
      const msg = err?.message?.toLowerCase().includes("invalid") || err?.message?.toLowerCase().includes("credentials")
        ? "E-mail ou senha incorretos."
        : err?.message ?? "Não foi possível entrar.";
      setError(msg);
      logFn({ data: { type: "login_failed", metadata: { email: email.trim() } } }).catch(() => {});
      return;
    }

    // Fetch context to route correctly
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
    <AuthShell
      title="Entrar na sua conta"
      subtitle="Acesse o painel do Disparos FR."
      footer={
        <div className="text-center text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link to="/cadastro" className="font-medium text-foreground hover:underline">Criar conta grátis</Link>
        </div>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="h-11"
            placeholder="voce@empresa.com.br"
          />
        </div>
        <div className="space-y-1">
          <PasswordInput id="password" label="Senha" value={password} onChange={setPassword} />
          <div className="flex justify-end">
            <Link to="/recuperar-senha" className="text-xs text-muted-foreground hover:text-foreground">
              Esqueci minha senha
            </Link>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" className="h-11 w-full" disabled={loading || locked}>
          {locked ? "Aguarde 30s…" : loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}
