import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, MessageSquare, Send, Users, FileText } from "lucide-react";

export const Route = createFileRoute("/painel/")({
  head: () => ({ meta: [{ title: "Painel — Disparos FR" }] }),
  component: PanelHome,
});

function PanelHome() {
  const { workspace } = { workspace: null as { name?: string } | null };

  const kpis = [
    { label: "Campanhas enviadas", value: "—" },
    { label: "Mensagens enviadas", value: "—" },
    { label: "Entregues", value: "—" },
    { label: "Lidas", value: "—" },
    { label: "Falhas", value: "—" },
    { label: "Respostas", value: "—" },
    { label: "Opt-outs", value: "—" },
    { label: "Estoque de mensagens", value: "—" },
  ];

  const checklist = [
    { done: false, label: "Complete seus dados", to: "/painel/configuracoes", icon: FileText },
    { done: false, label: "Conecte o WhatsApp", to: "/painel/whatsapp", icon: MessageSquare },
    { done: false, label: "Cadastre um template", to: "/painel/templates", icon: FileText },
    { done: false, label: "Importe contatos", to: "/painel/contatos", icon: Users },
    { done: false, label: "Crie sua primeira campanha", to: "/painel/campanhas", icon: Send },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bem-vindo ao Disparos FR</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Este é o seu painel. Complete os passos abaixo para começar a operar.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Primeiros passos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((c) => (
            <Link
              key={c.label}
              to={c.to as never}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:bg-muted/50"
            >
              <span className="flex items-center gap-3">
                {c.done ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">{c.label}</span>
              </span>
              <Button variant="ghost" size="sm">Abrir</Button>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="mt-2 text-2xl font-bold">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
