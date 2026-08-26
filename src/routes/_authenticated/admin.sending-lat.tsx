import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getSendingLatKeyStatus,
  setSendingLatKey,
  sendingLatCredits,
  sendingLatReports,
  sendingLatReportDetails,
  sendingLatSendCampaign,
} from "@/lib/sending-lat.functions";

export const Route = createFileRoute("/_authenticated/admin/sending-lat")({
  head: () => ({
    meta: [
      { title: "Integração sending.lat — Painel" },
      {
        name: "description",
        content:
          "Gerencie créditos, campanhas e relatórios da API sending.lat direto do painel administrativo.",
      },
      { property: "og:title", content: "Integração sending.lat — Painel" },
      {
        property: "og:description",
        content: "Créditos, envio de campanhas e relatórios da API sending.lat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Page() {
  const qc = useQueryClient();
  const keyStatusFn = useServerFn(getSendingLatKeyStatus);
  const saveKeyFn = useServerFn(setSendingLatKey);
  const creditsFn = useServerFn(sendingLatCredits);
  const reportsFn = useServerFn(sendingLatReports);
  const detailsFn = useServerFn(sendingLatReportDetails);
  const sendFn = useServerFn(sendingLatSendCampaign);

  const keyStatus = useQuery({ queryKey: ["sl-key"], queryFn: () => keyStatusFn() });
  const configured = keyStatus.data?.configured ?? false;

  const credits = useQuery({
    queryKey: ["sl-credits"],
    queryFn: () => creditsFn(),
    enabled: configured,
    retry: false,
  });

  const [apiKey, setApiKey] = useState("");
  const saveKey = useMutation({
    mutationFn: () => saveKeyFn({ data: { apiKey } }),
    onSuccess: () => {
      setApiKey("");
      toast.success("Chave salva");
      qc.invalidateQueries({ queryKey: ["sl-key"] });
      qc.invalidateQueries({ queryKey: ["sl-credits"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  // Reports
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const reports = useMutation({
    mutationFn: () => reportsFn({ data: { startDate, endDate } }),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao buscar relatórios"),
  });
  const [campaignId, setCampaignId] = useState("");
  const details = useMutation({
    mutationFn: () => detailsFn({ data: { campaignId } }),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao buscar detalhes"),
  });

  // Send
  const [form, setForm] = useState({
    nome_campanha: "",
    mensagem: "",
    numeros_manuais: "",
    base_contatos_id: "",
    tipo_midia: "nenhum" as "nenhum" | "imagem" | "video",
    midia_url: "",
    foto_perfil_url: "",
    nome_perfil: "",
    biografia: "",
    nome_btn1: "",
    link_btn1: "",
    nome_btn2: "",
    link_btn2: "",
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

  const creditsValue =
    (credits.data as any)?.creditos_disponiveis ?? (credits.data as any)?.creditos ?? null;

  return (
    <>
      <PageHeader
        title="Integração sending.lat"
        description="Créditos, envio de campanhas e relatórios via API externa."
      />

      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Créditos disponíveis
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {!configured ? "—" : credits.isPending ? "…" : (creditsValue ?? "—")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={!configured}
              onClick={() => credits.refetch()}
            >
              Atualizar
            </Button>
            {credits.error && (
              <p className="mt-2 text-xs text-destructive">
                {(credits.error as any)?.message}
              </p>
            )}
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status da chave</p>
            <p className="mt-2 text-lg font-medium">
              {configured ? `Configurada (${keyStatus.data?.masked})` : "Não configurada"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A chave é armazenada no backend e nunca exposta no navegador.
            </p>
          </div>
        </div>

        <Card title="Chave de API">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>Nova chave</Label>
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cole a chave da sending.lat"
              />
            </div>
            <Button onClick={() => saveKey.mutate()} disabled={apiKey.trim().length < 10 || saveKey.isPending}>
              Salvar chave
            </Button>
          </div>
        </Card>

        <Card title="Enviar campanha">
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
              <Label>Números manuais (separados por vírgula)</Label>
              <Textarea
                rows={3}
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
            <div className="sm:col-span-2">
              <Label>Biografia</Label>
              <Input value={form.biografia} onChange={set("biografia")} />
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
              <Label>Botão 2 — nome</Label>
              <Input value={form.nome_btn2} onChange={set("nome_btn2")} />
            </div>
            <div>
              <Label>Botão 2 — link</Label>
              <Input value={form.link_btn2} onChange={set("link_btn2")} />
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
              {send.isPending ? "Enviando…" : "Enviar campanha"}
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
        </Card>

        <Card title="Relatórios">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <Button variant="outline" disabled={!configured || reports.isPending} onClick={() => reports.mutate()}>
              Buscar relatórios
            </Button>
          </div>

          {Array.isArray((reports.data as any)?.reports) && (
            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(reports.data as any).reports.map((r: any, i: number) => (
                    <tr key={r.id ?? i} className="border-t">
                      <td className="px-3 py-2">{r.id ?? "—"}</td>
                      <td className="px-3 py-2">{r.nome ?? r.nome_campanha ?? "—"}</td>
                      <td className="px-3 py-2">{r.data ?? r.data_envio ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCampaignId(String(r.id ?? ""));
                            details.mutate();
                          }}
                        >
                          Detalhes
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-end gap-2">
            <div>
              <Label>ID da campanha</Label>
              <Input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
            </div>
            <Button
              variant="outline"
              disabled={!configured || !campaignId.trim() || details.isPending}
              onClick={() => details.mutate()}
            >
              Ver detalhes
            </Button>
          </div>
          {details.data ? (
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(details.data, null, 2)}
            </pre>
          ) : null}
        </Card>
      </div>
    </>
  );
}
