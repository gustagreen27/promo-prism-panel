import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Building2, KeyRound, ShieldCheck, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyContext } from "@/lib/auth.functions";
import { getGoogleAuthUrl, getGoogleConnection, disconnectGoogleCalendar, listGoogleCalendars, setGoogleCalendarPrefs } from "@/lib/google-calendar.functions";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/painel/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Disparos FR" }] }),
  component: Page,
});

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
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

function Page() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx, isLoading } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  if (isLoading || !ctx) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil, empresa e segurança.</p>
      </div>
      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil"><User className="mr-1 h-4 w-4" />Perfil</TabsTrigger>
          <TabsTrigger value="empresa"><Building2 className="mr-1 h-4 w-4" />Empresa</TabsTrigger>
          <TabsTrigger value="integracoes"><Calendar className="mr-1 h-4 w-4" />Integrações</TabsTrigger>
          <TabsTrigger value="seguranca"><KeyRound className="mr-1 h-4 w-4" />Segurança</TabsTrigger>
        </TabsList>
        <TabsContent value="perfil"><PerfilCard ctx={ctx} /></TabsContent>
        <TabsContent value="empresa"><EmpresaCard ctx={ctx} /></TabsContent>
        <TabsContent value="integracoes"><IntegracoesCard ctx={ctx} /></TabsContent>
        <TabsContent value="seguranca"><SegurancaCard ctx={ctx} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---- Perfil ---- */

function PerfilCard({ ctx }: { ctx: any }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cnpj, setCnpj] = useState("");

  useEffect(() => {
    setFullName(ctx.profile?.full_name ?? "");
    setPhone(ctx.profile?.phone ? maskPhone(ctx.profile.phone) : "");
    setCnpj(ctx.profile?.cnpj ? maskCnpj(ctx.profile.cnpj) : "");
  }, [ctx.profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({
        full_name: fullName.trim() || null,
        phone: phone.replace(/\D/g, "") || null,
        cnpj: cnpj.replace(/\D/g, "") || null,
      }).eq("id", ctx.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["my-context"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div>
          <Label>Email</Label>
          <Input value={ctx.profile?.email ?? ""} disabled />
          <p className="mt-1 text-xs text-muted-foreground">O email não pode ser alterado.</p>
        </div>
        <div>
          <Label>Nome completo</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---- Empresa ---- */

function EmpresaCard({ ctx }: { ctx: any }) {
  const qc = useQueryClient();
  const ws = ctx.primary_workspace;
  const [name, setName] = useState(ws?.name ?? "");
  const isOwner = ws?.role === "owner" || ws?.role === "admin";

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("workspaces")
        .update({ name: name.trim() }).eq("id", ws.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa atualizada");
      qc.invalidateQueries({ queryKey: ["my-context"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Empresa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Plano: {ws?.plan}</Badge>
          <Badge variant="outline">Status: {ws?.status}</Badge>
          <Badge variant="secondary">Seu papel: {ws?.role}</Badge>
        </div>
        <div>
          <Label>Nome da empresa</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
          {!isOwner && (
            <p className="mt-1 text-xs text-muted-foreground">
              Apenas owners/admins podem alterar o nome da empresa.
            </p>
          )}
        </div>
        <div>
          <Label>Slug do workspace</Label>
          <Input value={ws?.slug ?? ""} disabled />
        </div>
        <div>
          <Label>ID do workspace</Label>
          <Input value={ws?.id ?? ""} disabled className="font-mono text-xs" />
        </div>
        {isOwner && (
          <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2 || name === ws?.name}>
            {save.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ---- Segurança ---- */

function SegurancaCard({ ctx }: { ctx: any }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function changePassword() {
    if (pass.length < 8) return toast.error("A senha precisa ter ao menos 8 caracteres");
    if (pass !== confirm) return toast.error("As senhas não coincidem");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
      toast.success("Senha alterada com sucesso");
      setPass(""); setConfirm("");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Alterar senha</CardTitle></CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div>
            <Label>Nova senha</Label>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
          </div>
          <div>
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password" />
          </div>
          <Button onClick={changePassword} disabled={loading}>
            {loading ? "Alterando…" : "Alterar senha"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Sessão</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email autenticado</span>
            <span className="font-mono text-xs">{ctx.profile?.email}</span>
          </div>
          <Separator />
          <Button variant="outline" onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}>Encerrar sessão</Button>
        </CardContent>
      </Card>
    </div>
  );
}
