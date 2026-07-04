import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Plus, MessageSquare, Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyContext } from "@/lib/auth.functions";
import { createTemplateRequest, listMyTemplates } from "@/lib/client-panel.functions";

export const Route = createFileRoute("/painel/templates")({
  head: () => ({ meta: [{ title: "Templates — Disparos FR" }] }),
  component: Page,
});

type TemplateRow = {
  id: string; name: string; language: string; category: string; status: string;
  body: string; footer: string | null; created_at: string;
};
type RequestRow = {
  id: string; name: string; category: string; language: string;
  body: string; status: string; admin_notes: string | null; created_at: string;
};

const STATUS_COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  APPROVED: "default", approved: "default",
  PENDING: "secondary", pending: "secondary", em_revisao: "secondary",
  REJECTED: "destructive", rejected: "destructive", recusado: "destructive",
  aprovado: "default",
};

function Page() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const wsId = ctx?.primary_workspace?.id;
  if (!wsId) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Templates aprovados pela Meta para uso nas suas campanhas.
          </p>
        </div>
        <NewRequestDialog workspaceId={wsId} />
      </div>

      <Tabs defaultValue="approved">
        <TabsList>
          <TabsTrigger value="approved"><FileText className="mr-1 h-4 w-4" />Meus templates</TabsTrigger>
          <TabsTrigger value="requests"><Clock className="mr-1 h-4 w-4" />Solicitações</TabsTrigger>
        </TabsList>
        <TabsContent value="approved"><ApprovedList workspaceId={wsId} /></TabsContent>
        <TabsContent value="requests"><RequestsList workspaceId={wsId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ApprovedList({ workspaceId }: { workspaceId: string }) {
  const listFn = useServerFn(listMyTemplates);
  const { data, isLoading } = useQuery({
    queryKey: ["ws-templates-approved", workspaceId],
    queryFn: () => listFn({ data: { workspace_id: workspaceId } }),
  });
  const templates = (data?.templates ?? []) as TemplateRow[];

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!templates.length) return (
    <Card><CardContent className="p-8 text-center">
      <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">Nenhum template aprovado ainda</p>
      <p className="text-xs text-muted-foreground">Solicite um template novo para começar a enviar campanhas.</p>
    </CardContent></Card>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {templates.map((t) => (
        <Card key={t.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t.name}</CardTitle>
              <Badge variant={STATUS_COLOR[t.status] ?? "outline"}>{t.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">{t.category} · {t.language}</div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">{t.body}</div>
            {t.footer && <div className="mt-2 text-xs text-muted-foreground">{t.footer}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RequestsList({ workspaceId }: { workspaceId: string }) {
  const { data = [], isLoading } = useQuery<RequestRow[]>({
    queryKey: ["ws-template-requests", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_template_requests")
        .select("id,name,category,language,body,status,admin_notes,created_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as RequestRow[]) || [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!data.length) return (
    <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
      Nenhuma solicitação enviada.
    </CardContent></Card>
  );

  return (
    <div className="space-y-2">
      {data.map((r) => (
        <Card key={r.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant={STATUS_COLOR[r.status] ?? "outline"}>{r.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.category} · {r.language} · {new Date(r.created_at).toLocaleString("pt-BR")}
                </div>
                {r.admin_notes && (
                  <div className="mt-2 text-xs rounded bg-muted/50 p-2">
                    <strong>Notas:</strong> {r.admin_notes}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 text-sm whitespace-pre-wrap rounded bg-muted/40 p-3">{r.body}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NewRequestDialog({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");

  const reqFn = useServerFn(createTemplateRequest);
  const submit = useMutation({
    mutationFn: () => reqFn({ data: {
      workspace_id: workspaceId,
      name: name.trim().toLowerCase().replace(/\s+/g, "_"),
      category, language, body: body.trim(),
      footer: footer.trim() || undefined,
      variables: [], buttons: [],
    } }),
    onSuccess: () => {
      toast.success("Solicitação enviada. Nossa equipe irá revisar.");
      setName(""); setBody(""); setFooter(""); setOpen(false);
      qc.invalidateQueries({ queryKey: ["ws-template-requests", workspaceId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" />Solicitar template</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar novo template</DialogTitle>
          <DialogDescription>
            Nossa equipe revisa e submete o template à Meta. Aprovação em até 24h úteis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome (identificador)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: promo_natal_2026" />
            <p className="mt-1 text-xs text-muted-foreground">Sem espaços, apenas letras minúsculas e underscore.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utilidade</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en">Inglês</SelectItem>
                  <SelectItem value="es">Espanhol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Corpo da mensagem</Label>
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Olá {{1}}, sua compra {{2}} foi confirmada!" />
            <p className="mt-1 text-xs text-muted-foreground">Use <code>&#123;&#123;1&#125;&#125;</code>, <code>&#123;&#123;2&#125;&#125;</code>… para variáveis.</p>
          </div>
          <div>
            <Label>Rodapé (opcional)</Label>
            <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Ex: Enviado por Disparos FR" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={name.trim().length < 3 || body.trim().length < 1 || submit.isPending}
          >
            {submit.isPending ? "Enviando…" : "Enviar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
