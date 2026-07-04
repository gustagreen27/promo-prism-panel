import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (search.reason === "no-access") {
      setError("Sua conta não tem acesso ao painel. Entre em contato com o administrador.");
    }
  }, [search.reason]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      setError(error?.message ?? "Não foi possível entrar.");
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const internal = new Set(["admin", "super_admin", "support", "finance", "operations"]);
    const isInternal = (roles ?? []).some((r) => internal.has(r.role as string));
    setLoading(false);
    navigate({ to: isInternal ? "/admin" : "/painel" });
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse sua conta do Disparos FR."
      footer={
        <div className="flex justify-between text-sm text-muted-foreground">
          <Link to="/recuperar-senha" className="hover:text-foreground">Esqueci minha senha</Link>
          <Link to="/cadastro" className="hover:text-foreground">Criar conta</Link>
        </div>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <Field id="email" label="E-mail" type="email" value={email} onChange={setEmail} />
        <Field id="password" label="Senha" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-sm font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">D</span>
          Disparos FR
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {children}
            {footer}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete ?? (type === "password" ? "current-password" : type === "email" ? "email" : undefined)}
      />
    </div>
  );
}
