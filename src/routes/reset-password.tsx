import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthShell, Field } from "./login";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redefinir senha — Disparos FR" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Senha deve ter pelo menos 8 caracteres");
    if (password !== confirm) return setError("As senhas não coincidem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    navigate({ to: "/painel" });
  }

  return (
    <AuthShell title="Redefinir senha" subtitle="Defina uma nova senha para acessar sua conta.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="password" label="Nova senha" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <Field id="confirm" label="Confirmar senha" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>
    </AuthShell>
  );
}
