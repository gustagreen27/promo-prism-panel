import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput, PasswordStrength, passwordStrength } from "@/components/auth/PasswordInput";
import { logAuthEvent } from "@/lib/auth.functions";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redefinir senha — Disparos FR" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const logFn = useServerFn(logAuthEvent);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<"checking" | "ready" | "invalid">("checking");

  useEffect(() => {
    // Supabase places a recovery session on the URL hash; wait for the auth event.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady("ready");
    });
    // Also check current session (link may have already been consumed)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady("ready");
      else setTimeout(() => setReady((r) => (r === "checking" ? "invalid" : r)), 2000);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordStrength(password).score < 2) return setError("Escolha uma senha mais forte");
    if (password !== confirm) return setError("As senhas não coincidem");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(err.message);
    logFn({ data: { type: "password_reset_completed" } }).catch(() => {});
    navigate({ to: "/painel" });
  }

  if (ready === "invalid") {
    return (
      <AuthShell title="Link inválido ou expirado" subtitle="O link de recuperação não é mais válido.">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Solicite um novo link para redefinir sua senha.
          </p>
          <Button asChild className="w-full">
            <Link to="/recuperar-senha">Solicitar novo link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Redefinir senha" subtitle="Escolha uma senha nova e segura para sua conta.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <PasswordInput id="password" label="Nova senha" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordStrength pw={password} />
        </div>
        <PasswordInput id="confirm" label="Confirmar senha" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button type="submit" className="h-11 w-full" disabled={loading || ready !== "ready"}>
          {loading ? "Salvando…" : "Salvar nova senha"}
        </Button>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          Ao salvar, você será direcionado para o seu painel.
        </p>
      </form>
    </AuthShell>
  );
}
