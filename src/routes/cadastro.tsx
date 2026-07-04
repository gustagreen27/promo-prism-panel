import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput, PasswordStrength, passwordStrength } from "@/components/auth/PasswordInput";
import { logAuthEvent } from "@/lib/auth.functions";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Informe seu nome completo"),
    email: z.string().trim().email("E-mail inválido"),
    phone: z.string().trim().min(8, "Informe um telefone válido"),
    company_name: z.string().trim().min(2, "Informe o nome da empresa"),
    cnpj: z.string().trim().optional(),
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    confirm: z.string(),
    accept: z.literal(true, { errorMap: () => ({ message: "Você precisa aceitar os termos" }) }),
  })
  .refine((d) => d.password === d.confirm, { message: "As senhas não coincidem", path: ["confirm"] })
  .refine((d) => passwordStrength(d.password).score >= 2, { message: "Escolha uma senha mais forte", path: ["password"] });

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export const Route = createFileRoute("/cadastro")({
  ssr: false,
  head: () => ({ meta: [{ title: "Criar conta — Disparos FR" }] }),
  component: CadastroPage,
});

function CadastroPage() {
  const navigate = useNavigate();
  const logFn = useServerFn(logAuthEvent);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    company_name: "",
    cnpj: "",
    password: "",
    confirm: "",
    accept: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
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
    const { data, error: err } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin + "/painel",
        data: {
          full_name: parsed.data.full_name,
          phone: parsed.data.phone,
          company_name: parsed.data.company_name,
          cnpj: parsed.data.cnpj ?? null,
        },
      },
    });
    setLoading(false);
    if (err) {
      const msg = err.message.toLowerCase().includes("already")
        ? "Este e-mail já está cadastrado. Faça login."
        : err.message;
      setError(msg);
      return;
    }
    logFn({ data: { type: "signup", metadata: { email: parsed.data.email } } }).catch(() => {});

    if (data.session) {
      navigate({ to: "/painel" });
    } else {
      setNeedsConfirmation(true);
    }
  }

  if (needsConfirmation) {
    return (
      <AuthShell title="Confirme seu e-mail" subtitle="Estamos quase lá.">
        <div className="space-y-4 rounded-lg border bg-muted/30 p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">Enviamos um link para {form.email}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Clique no link do e-mail para ativar sua conta e entrar no painel.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Criar sua conta"
      subtitle="Comece a operar campanhas oficiais no WhatsApp em poucos minutos."
      footer={
        <div className="text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/login" className="font-medium text-foreground hover:underline">Entrar</Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Nome completo</Label>
          <Input id="full_name" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} autoComplete="name" className="h-11" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail corporativo</Label>
            <Input id="email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp</Label>
            <Input id="phone" required value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} autoComplete="tel" placeholder="(11) 99999-9999" className="h-11" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company_name">Nome da empresa</Label>
            <Input id="company_name" required value={form.company_name} onChange={(e) => set("company_name", e.target.value)} autoComplete="organization" className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="cnpj" value={form.cnpj} onChange={(e) => set("cnpj", maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" className="h-11" />
          </div>
        </div>
        <div className="space-y-2">
          <PasswordInput id="password" label="Senha" value={form.password} onChange={(v) => set("password", v)} autoComplete="new-password" />
          <PasswordStrength pw={form.password} />
        </div>
        <PasswordInput id="confirm" label="Confirmar senha" value={form.confirm} onChange={(v) => set("confirm", v)} autoComplete="new-password" />

        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <Checkbox checked={form.accept} onCheckedChange={(v) => set("accept", Boolean(v))} className="mt-0.5" />
          <span className="text-muted-foreground">
            Li e aceito os <Link to="/politica-de-privacidade" className="text-foreground underline">Termos de Uso e Política de Privacidade</Link>.
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? "Criando conta…" : "Criar conta grátis"}
        </Button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          Sem cartão de crédito. Você só paga o que enviar.
        </div>
      </form>
    </AuthShell>
  );
}
