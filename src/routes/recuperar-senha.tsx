import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";
import { AlertCircle, Mail } from "lucide-react";

export const Route = createFileRoute("/recuperar-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: "Recuperar senha — Disparos FR" }] }),
  component: RecuperarPage,
});

function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    if (err) return setError(err.message);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="Verifique seu e-mail" subtitle="Se o e-mail existir, enviaremos um link para redefinir sua senha.">
        <div className="space-y-4 rounded-lg border bg-muted/30 p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Enviamos um link para <span className="font-medium text-foreground">{email}</span> caso essa conta exista.
            Verifique também sua caixa de spam.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Voltar para o login</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Enviaremos um link por e-mail para você redefinir a senha."
      footer={<div className="text-center text-sm"><Link to="/login" className="hover:underline">Voltar para o login</Link></div>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" autoComplete="email" />
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? "Enviando…" : "Enviar link de recuperação"}
        </Button>
      </form>
    </AuthShell>
  );
}
