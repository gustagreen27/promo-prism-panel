import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send, Wallet } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getSendingLatKeyStatus,
  sendingLatCredits,
  sendingLatSendCampaign,
} from "@/lib/sending-lat.functions";

export const Route = createFileRoute("/_authenticated/admin/disparos/api-externa")({
  head: () => ({
    meta: [
      { title: "Disparo via API externa — sending.lat" },
      {
        name: "description",
        content:
          "Crie disparos de WhatsApp usando a API externa sending.lat direto do painel de disparos.",
      },
      { property: "og:title", content: "Disparo via API externa — sending.lat" },
      {
        property: "og:description",
        content: "Envie campanhas de WhatsApp pela API sending.lat sem sair do painel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const keyStatusFn = useServerFn(getSendingLatKeyStatus);
  const creditsFn = useServerFn(sendingLatCredits);
  const sendFn = useServerFn(sendingLatSendCampaign);

  const keyStatus = useQuery({ queryKey: ["sl-key"], queryFn: () => keyStatusFn() });
  const configured = keyStatus.data?.configured ?? false;
  const credits = useQuery({
    queryKey: ["sl-credits"],
    queryFn: () => creditsFn(),
    enabled: configured,
    retry: false,
  });
  const creditsValue =
    (credits.data as any)?.creditos_disponiveis ?? (credits.data as any)?.creditos ?? null;

  const [form, setForm] = useState({
    nome_campanha: "",
    mensagem: "",
    numeros_manuais: "",
    base_contatos_id: "",
    tipo_midia: "nenhum" as "nenhum" | "imagem" | "video",
    midia_url: "",
    nome_perfil: "",
    foto_perfil_url: "",
    nome_btn1: "",
    link_btn1: "",
    nome_btn_rapida: "",
    data_agendamento: "",
    hora_agendamento: "",
  });
  const set = (k: keyof typeof form) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = useMutation({
    mutationFn: () => {
      const agenda = Boolean(form.data_agendamento && form.hora_agendamento);
      return sendFn({
        data: {
          ...form,
          agendar_envio: agenda ? 1 : 0,
          data_agendamento: agenda ? form.data_agendamento : undefined,
          hora_agendamento: agenda ? form.hora_agendamento : undefined,
        } as any,
      });
    },
    onSuccess: (res: any) => {
      if ((res?.status ?? "") === "success") toast.success(res?.message ?? "Campanha enviada");
      else toast.warning(res?.message ?? "Retorno inesperado da API");
      qc.invalidateQueries({ queryKey: ["sl-credits"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar"),
  });

  const contactsCount = form.numeros_manuais
    .split(/[\n,;]/)
    .map((s) => s.replace(/\D/g, ""))
    .filter((s) => s.length >= 10).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disparo via API externa"
        description="Crie e agende disparos usando a API sending.lat, vinculada ao painel de disparos."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/disparos">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para disparos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/sending-lat">Configurações da API</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-4 w-4" /> Créditos disponíveis
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {!configured ? "—" : credits.isPending ? "…" : (creditsValue ?? "—")}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Status da chave</p>
          <p className="mt-2 text-lg font-medium">
            {configured ? `Configurada (${keyStatus.data?.masked})` : "Não configurada"}
          </p>
          {!configured && (
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre a chave em Configurações da API para habilitar o envio.
            </p>
          )}
        </div>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Nova campanha (API externa)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome da campanha *</Label>
            <Input value={form.nome_campanha} onChange={set("nome_campanha")} />
          </div>
          <div>
            <Label>Base de contatos (ID)</Label>
            <Input value={form.base_contatos_id} onChange={set("base_contatos_id")} />
          </div>
          <div className="sm:col-span-2">
            <Label>Mensagem *</Label>
            <Textarea rows={4} value={form.mensagem} onChange={set("mensagem")} />
          </div>
          <div className="sm:col-span-2">
            <Label>Números manuais — {contactsCount} contato(s)</Label>
            <Textarea
              rows={4}
              value={form.numeros_manuais}
              onChange={set("numeros_manuais")}
              placeholder="5511999998888, 5521977776666"
            />
          </div>
          <div>
            <Label>Tipo de mídia</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.tipo_midia}
              onChange={set("tipo_midia")}
            >
              <option value="nenhum">Nenhum</option>
              <option value="imagem">Imagem</option>
              <option value="video">Vídeo</option>
            </select>
          </div>
          <div>
            <Label>URL da mídia</Label>
            <Input value={form.midia_url} onChange={set("midia_url")} />
          </div>
          <div>
            <Label>Nome do perfil</Label>
            <Input value={form.nome_perfil} onChange={set("nome_perfil")} />
          </div>
          <div>
            <Label>Foto de perfil (URL)</Label>
            <Input value={form.foto_perfil_url} onChange={set("foto_perfil_url")} />
          </div>
          <div>
            <Label>Botão 1 — nome</Label>
            <Input value={form.nome_btn1} onChange={set("nome_btn1")} />
          </div>
          <div>
            <Label>Botão 1 — link</Label>
            <Input value={form.link_btn1} onChange={set("link_btn1")} />
          </div>
          <div>
            <Label>Botão de resposta rápida</Label>
            <Input value={form.nome_btn_rapida} onChange={set("nome_btn_rapida")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Data (agendar)</Label>
              <Input type="date" value={form.data_agendamento} onChange={set("data_agendamento")} />
            </div>
            <div>
              <Label>Hora</Label>
              <Input type="time" value={form.hora_agendamento} onChange={set("hora_agendamento")} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={() => send.mutate()}
            disabled={
              !configured ||
              send.isPending ||
              !form.nome_campanha.trim() ||
              !form.mensagem.trim() ||
              (!form.numeros_manuais.trim() && !form.base_contatos_id.trim())
            }
          >
            <Send className="mr-2 h-4 w-4" />
            {send.isPending ? "Enviando…" : "Enviar pela API externa"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Informe números manuais ou o ID de uma base de contatos.
          </span>
        </div>

        {send.data ? (
          <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(send.data, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
