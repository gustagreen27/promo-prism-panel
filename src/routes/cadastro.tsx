import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthShell, Field } from "./login";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Informe seu nome"),
    email: z.string().trim().email("E-mail inválido"),
    phone: z.string().trim().min(8, "Informe um telefone válido"),
    company_name: z.string().trim().min(2, "Informe o nome da empresa"),
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

export const Route = createFileRoute("/cadastro")({
  ssr: false,
  head: () => ({ meta: [{ title: "Criar conta — Disparos FR" }] }),
  component: CadastroPage,
});

function CadastroPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", company_name: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K) {
    return (v: string) => setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin + "/painel",
        data: {
          full_name: parsed.data.full_name,
          phone: parsed.data.phone,
          company_name: parsed.data.company_name,
        },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/painel" });
  }

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Comece a operar campanhas oficiais no WhatsApp."
      footer={
        <div className="text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/login" className="text-foreground hover:underline">Entrar</Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="full_name" label="Nome completo" value={form.full_name} onChange={set("full_name")} autoComplete="name" />
        <Field id="company_name" label="Nome da empresa" value={form.company_name} onChange={set("company_name")} autoComplete="organization" />
        <Field id="email" label="E-mail" type="email" value={form.email} onChange={set("email")} />
        <Field id="phone" label="Telefone" value={form.phone} onChange={set("phone")} autoComplete="tel" />
        <Field id="password" label="Senha" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
        <Field id="confirm" label="Confirmar senha" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Criando..." : "Criar conta"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Ao criar sua conta você concorda com nossos termos e a política de privacidade.
        </p>
      </form>
    </AuthShell>
  );
}
