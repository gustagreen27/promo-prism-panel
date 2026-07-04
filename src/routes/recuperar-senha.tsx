import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthShell, Field } from "./login";

export const Route = createFileRoute("/recuperar-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: "Recuperar senha — Disparos FR" }] }),
  component: RecuperarPage,
});

function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMessage(null); setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    if (error) setError(error.message);
    else setMessage("Se este e-mail existir, você receberá um link para redefinir a senha.");
  }

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Enviaremos um link por e-mail para você redefinir a senha."
      footer={<div className="text-center text-sm"><Link to="/login" className="hover:underline">Voltar para o login</Link></div>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="email" label="E-mail" type="email" value={email} onChange={setEmail} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Enviando..." : "Enviar link"}
        </Button>
      </form>
    </AuthShell>
  );
}
