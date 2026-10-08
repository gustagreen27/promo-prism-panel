import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Send, Rocket, Upload, Loader2, Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppPreview } from "@/components/campaigns/wizard/WhatsAppPreview";
import {
  validateDirectConfig, BODY_MAX, IMAGE_MIME, VIDEO_MIME, IMAGE_MAX_MB, VIDEO_MAX_MB,
  type DirectConfig, type DirectHeaderType, type DirectButtonsType,
  applyCustomVars, parseVarValues, textUsesVar, type CustomVar,
} from "@/lib/direct-send";
import { validatePacing, type PacingConfig } from "@/lib/direct-pacing";
import { PacingPanel } from "@/components/campaigns/PacingPanel";
import { NewContactListDialog } from "@/components/campaigns/NewContactListDialog";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { listReplyAutomations, createReplyFlowFromButtons } from "@/lib/automations.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listConnections } from "@/lib/whatsapp.functions";
import { listLists } from "@/lib/contact-lists.functions";
import { createWaCampaign, updateWaCampaign, getWaCampaign, buildRecipients, startWaCampaign, scheduleWaCampaign, testDirectSend } from "@/lib/wa-campaigns.functions";

export const Route = createFileRoute("/_authenticated/admin/disparos/direct-send")({
  validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s.id === "string" ? { id: s.id } : {}),
  head: () => ({ meta: [{ title: "Direct Send — Utilidade" }] }),
  component: Page,
});

function render(text: string, nome: string) {
  const v = (k: string) => new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}|\\{\\s*${k}\\s*\\}|\\(\\s*${k}\\s*\\)|\\[\\s*${k}\\s*\\]`, "gi");
  return text.replace(v("nome"), nome || "cliente").replace(v("telefone"), "5562999999999");
}

function Page() {
  const navigate = useNavigate();
  const { id: draftId } = Route.useSearch();
  const updateFn = useServerFn(updateWaCampaign);
  const getFn = useServerFn(getWaCampaign);
  const connsFn = useServerFn(listConnections);
  const listsFn = useServerFn(listLists);
  const createFn = useServerFn(createWaCampaign);
  const buildFn = useServerFn(buildRecipients);
  const startFn = useServerFn(startWaCampaign);
  const schedFn = useServerFn(scheduleWaCampaign);
  const testFn = useServerFn(testDirectSend);
  const replyAutosFn = useServerFn(listReplyAutomations);
  const createFlowFn = useServerFn(createReplyFlowFromButtons);
  const [automationId, setAutomationId] = useState<string>("");
  const { data: conns = [] } = useQuery({ queryKey: ["wa-conns-all"], queryFn: () => connsFn() });
  const qc = useQueryClient();
  const [newListOpen, setNewListOpen] = useState(false);
  const { data: lists = [] } = useQuery({ queryKey: ["contact-lists-all"], queryFn: () => listsFn() });

  const [name, setName] = useState("Direct Send — ");
  const [connId, setConnId] = useState("");
  const [listId, setListId] = useState("");
  const [text, setText] = useState("Olá, {nome}. O pagamento do seu pedido foi confirmado.");
  const [testTo, setTestTo] = useState("");
  const [testName, setTestName] = useState("");
  const [when, setWhen] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [headerType, setHeaderType] = useState<DirectHeaderType>("none");
  const [headerText, setHeaderText] = useState("");
  const [media, setMedia] = useState<{ path: string; mime: string; previewUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [footer, setFooter] = useState("");
  const [buttonsType, setButtonsType] = useState<DirectButtonsType>("none");
  const [urlBtn, setUrlBtn] = useState({ text: "", url: "https://" });
  const [replies, setReplies] = useState([{ id: "opcao_1", title: "" }]);
  const [pacingOn, setPacingOn] = useState(false);
  const [pace, setPace] = useState({ msgs_min: "3", msgs_max: "6", interval_min_s: "10", interval_max_s: "30", pause_min: "2", pause_max: "5" });
  const [customVars, setCustomVars] = useState<(CustomVar & { raw: string })[]>([]);
  const [variants, setVariants] = useState<string[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [pauseUnit, setPauseUnit] = useState<"s" | "min">("min");

  const draftQ = useQuery({ queryKey: ["direct-draft", draftId], queryFn: () => getFn({ data: { id: draftId! } }), enabled: !!draftId });
  useEffect(() => {
    const d: any = draftQ.data;
    if (!d) return;
    setName(d.name ?? ""); setConnId(d.connection_id ?? ""); setListId(d.list_id ?? ""); setText(d.direct_text ?? "");
    const c = d.direct_config ?? {};
    setHeaderType(c.header_type ?? "none"); setHeaderText(c.header_text ?? ""); setFooter(c.footer ?? "");
    setButtonsType(c.buttons_type ?? "none");
    if (c.url_button) setUrlBtn(c.url_button);
    if (c.reply_buttons?.length) setReplies(c.reply_buttons);
    setAutomationId(c.automation_id ?? "");
    setCustomVars((c.custom_vars ?? []).map((v: any) => ({ ...v, values: v.values ?? [], raw: (v.values ?? []).join("\n") })));
    setVariants(c.message_variants ?? []);
    setPacingOn(!!d.pacing_enabled);
    if (d.pacing_config) {
      const p = d.pacing_config;
      const useMin = p.pause_min_s % 60 === 0 && p.pause_max_s % 60 === 0;
      setPauseUnit(useMin ? "min" : "s");
      const k = useMin ? 60 : 1;
      setPace({ msgs_min: String(p.msgs_min), msgs_max: String(p.msgs_max), interval_min_s: String(p.interval_min_s), interval_max_s: String(p.interval_max_s), pause_min: String(p.pause_min_s / k), pause_max: String(p.pause_max_s / k) });
    }
    if (c.media_path) {
      setMedia({ path: c.media_path, mime: c.media_mime ?? "", previewUrl: "" });
      supabase.storage.from("campaign-images").createSignedUrl(c.media_path, 3600).then(({ data: su }) => {
        if (su?.signedUrl) setMedia({ path: c.media_path, mime: c.media_mime ?? "", previewUrl: su.signedUrl });
      });
    } else setMedia(null);
  }, [draftQ.data]);

  const interactive = buttonsType !== "none";
  const effHeader: DirectHeaderType = interactive ? headerType : "none";
  const config: DirectConfig = {
    header_type: effHeader,
    header_text: effHeader === "text" ? headerText : null,
    media_path: effHeader === "image" || effHeader === "video" ? media?.path ?? null : null,
    media_mime: effHeader === "image" || effHeader === "video" ? media?.mime ?? null : null,
    footer: interactive ? footer : null,
    buttons_type: buttonsType,
    url_button: buttonsType === "url" ? urlBtn : null,
    reply_buttons: buttonsType === "reply" ? replies : null,
    automation_id: automationId || null,
    custom_vars: customVars.length ? customVars.map(({ raw: _r, ...v }) => ({ ...v, name: v.name.trim(), column: v.mode === "column" ? (v.column ?? "").trim() : null })) : null,
    message_variants: variants.map((v) => v.trim()).filter(Boolean).length ? variants.map((v) => v.trim()).filter(Boolean) : null,
  };
  const cleanVars = config.custom_vars ?? [];
  const cleanVariants = config.message_variants ?? [];
  const previewBody = (idx: number) => render(applyCustomVars(pickDirectText(text, cleanVariants, idx), cleanVars, { index: idx }).text, testName);
  const updVar = (i: number, patch: Partial<CustomVar & { raw: string }>) =>
    setCustomVars((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const replyAutosQ = useQuery({ queryKey: ["reply-automations", connId], queryFn: () => replyAutosFn({ data: { connectionId: connId || null } }), enabled: !!connId });
  const createFlow = async () => {
    try {
      const r = await createFlowFn({ data: { connectionId: connId, name: name || "Direct Send", buttons: buttonsType === "reply" ? replies.filter((x) => x.id) : [], text } });
      setAutomationId(r.id);
      qc.invalidateQueries({ queryKey: ["reply-automations", connId] });
      window.open(`/admin/automacoes/${r.id}`, "_blank");
      toast.success("Fluxo criado como rascunho. Ajuste as mensagens e publique.");
    } catch (e: any) { toast.error(e.message); }
  };
  const unitK = pauseUnit === "min" ? 60 : 1;
  const toInt = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const pacingConfig: PacingConfig = {
    msgs_min: toInt(pace.msgs_min), msgs_max: toInt(pace.msgs_max),
    interval_min_s: toInt(pace.interval_min_s), interval_max_s: toInt(pace.interval_max_s),
    pause_min_s: Math.round(toInt(pace.pause_min) * unitK), pause_max_s: Math.round(toInt(pace.pause_max) * unitK),
  };
  const errors = [...validateDirectConfig(text, config), ...(pacingOn ? validatePacing(pacingConfig) : [])];

  async function onFile(f: File) {
    const kind = headerType;
    const allowed = kind === "image" ? (IMAGE_MIME as readonly string[]) : (VIDEO_MIME as readonly string[]);
    const maxMb = kind === "image" ? IMAGE_MAX_MB : VIDEO_MAX_MB;
    if (!allowed.includes(f.type)) return toast.error(kind === "image" ? "Use JPG ou PNG." : "Use MP4 ou 3GP.");
    if (f.size > maxMb * 1024 * 1024) return toast.error(`Arquivo acima de ${maxMb}MB (limite da Meta).`);
    setUploading(true);
    try {
      const ext = f.name.split(".").pop()?.toLowerCase() || "bin";
      // 1ª pasta precisa ser um UUID: a regra de acesso do bucket converte esse trecho para UUID.
      const path = `${crypto.randomUUID()}/direct-send.${ext}`;
      const { error } = await supabase.storage.from("campaign-images").upload(path, f, { contentType: f.type });
      if (error) throw error;
      setMedia({ path, mime: f.type, previewUrl: URL.createObjectURL(f) });
      toast.success("Arquivo salvo");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally { setUploading(false); }
  }

  const test = useMutation({
    mutationFn: () => testFn({ data: { connection_id: connId, to: testTo, text, nome: testName || null, direct_config: config } }),
    onSuccess: (r: any) => {
      setTestResult(r);
      if (r.ok) toast.success(`Teste aceito pela Meta (${r.wamid})`);
      else toast.error(r.not_enabled ? "Direct Send não está habilitado para esta conta." : r.error);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no teste"),
  });

  async function persist(): Promise<string> {
    const payload = { name, connection_id: connId, list_id: listId, send_mode: "direct_utility", direct_text: text, direct_config: config, participants: [], pacing_enabled: pacingOn, pacing_config: pacingOn ? pacingConfig : null } as any;
    if (draftId) { await updateFn({ data: { id: draftId, ...payload } }); return draftId; }
    const camp: any = await createFn({ data: payload });
    return camp.id as string;
  }

  const save = useMutation({
    mutationFn: persist,
    onSuccess: (id) => { toast.success("Demanda salva como rascunho"); if (id !== draftId) navigate({ to: "/admin/disparos/direct-send", search: { id } }); else draftQ.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const launch = useMutation({
    mutationFn: async () => {
      const camp = { id: await persist() };
      const b = await buildFn({ data: { id: camp.id } });
      if (!b.total) throw new Error("A lista não tem contatos elegíveis (após opt-out/supressão).");
      if (when) await schedFn({ data: { id: camp.id, scheduled_at: new Date(when).toISOString() } });
      else await startFn({ data: { id: camp.id, confirm_warnings: true } });
      return camp.id;
    },
    onSuccess: (id) => { toast.success(when ? "Demanda agendada" : "Demanda iniciada"); navigate({ to: "/admin/disparos/$id", params: { id } }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const ready = connId && listId && name.trim() && errors.length === 0;
  const blocked = testResult?.not_enabled;

  return (
    <>
      <PageHeader title="Direct Send — Utilidade" description="Mensagem de texto transacional sem template (categoria utility)." />
      <div className="mb-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div>
          <b>Use apenas para comunicações transacionais de utilidade</b> — confirmação de pagamento, status de pedido, entrega, agendamento.
          Ofertas, convites, promoções e campanhas de marketing <b>não</b> são utilidade e devem usar template. A conta selecionada precisa
          ser a mesma que recebeu o aviso de qualificação no Gerenciador do WhatsApp.
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div><Label>Nome da demanda</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Número conectado</Label>
            <Select value={connId} onValueChange={(v) => { setConnId(v); setTestResult(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{(conns as any[]).filter((c) => c.phone_number_id).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.display_phone ?? c.phone ?? c.phone_number_id} — {c.verified_name ?? c.name}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          <div><Label>Lista de contatos</Label>
            <Select value={listId} onValueChange={(v) => { if (v === "__new__") setNewListOpen(true); else setListId(v); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">+ Criar nova lista</SelectItem>
                {(lists as any[]).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <NewContactListDialog open={newListOpen} onOpenChange={setNewListOpen}
              onCreated={async (l) => {
                qc.setQueryData(["contact-lists-all"], (old: any[] = []) => [{ id: l.id, name: l.name }, ...old.filter((x) => x.id !== l.id)]);
                setListId(l.id);
                qc.invalidateQueries({ queryKey: ["contact-lists-all"] });
              }} />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Mensagem</Label>
              <div className="flex gap-1">
                {[{ k: "{nome}", l: "Nome do lead" }, { k: "{telefone}", l: "Telefone do lead" }].map((f) => (
                  <Button key={f.k} type="button" size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => {
                      const el = document.getElementById("direct-text") as HTMLTextAreaElement | null;
                      const s = el?.selectionStart ?? text.length, e = el?.selectionEnd ?? text.length;
                      setText(text.slice(0, s) + f.k + text.slice(e));
                    }}>+ {f.l}</Button>
                ))}
              </div>
            </div>
            <Textarea id="direct-text" rows={6} maxLength={BODY_MAX} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Os campos {"{nome}"} e {"{telefone}"} (também aceitos como (nome) e (telefone)) são trocados pelos dados de cada lead. Sem nome cadastrado, aparece "cliente".</p>
            <p className="mt-1 text-xs text-muted-foreground">{text.length}/{BODY_MAX}</p>
          </div>
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Variáveis personalizadas</div>
                <p className="text-xs text-muted-foreground">Escreva no texto, por exemplo, (pendência real) e cadastre a variável aqui com o mesmo nome.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomVars((vs) => [...vs, { name: "", mode: "column", values: [], column: "", raw: "" }])}>
                <Plus className="mr-1 h-4 w-4" />Variável
              </Button>
            </div>
            {customVars.map((v, i) => {
              const used = v.name.trim() ? textUsesVar(text, v.name) : false;
              return (
                <div key={i} className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <div className="flex gap-2">
                    <Input placeholder="Nome (ex.: pendência real)" value={v.name} onChange={(e) => updVar(i, { name: e.target.value })} />
                    <Button type="button" size="icon" variant="ghost" disabled={!v.name.trim()} title="Inserir no texto"
                      onClick={() => {
                        const el = document.getElementById("direct-text") as HTMLTextAreaElement | null;
                        const s0 = el?.selectionStart ?? text.length, e0 = el?.selectionEnd ?? text.length;
                        setText(text.slice(0, s0) + `(${v.name.trim()})` + text.slice(e0));
                      }}><Plus className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setCustomVars((vs) => vs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Select value={v.mode} onValueChange={(m) => updVar(i, { mode: m as CustomVar["mode"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="column">Valor de cada contato (coluna da lista)</SelectItem>
                      <SelectItem value="rotate">Alternar valores em sequência</SelectItem>
                    </SelectContent>
                  </Select>
                  {v.mode === "column" && (
                    <div>
                      <Input placeholder="Nome da coluna na lista (ex.: pendencia)" value={v.column ?? ""} onChange={(e) => updVar(i, { column: e.target.value })} />
                      <p className="mt-1 text-xs text-muted-foreground">Use para informações reais de cada pessoa, como a pendência do perfil. Contatos sem esse dado usam os valores de reserva abaixo; sem reserva, não recebem a mensagem.</p>
                    </div>
                  )}
                  <div>
                    <Textarea rows={3} placeholder={v.mode === "column" ? "Valores de reserva (opcional) — separados por vírgula ou um por linha" : "Cadastro desatualizado, E-mail incorreto, Dados de contato"}
                      value={v.raw} onChange={(e) => updVar(i, { raw: e.target.value, values: parseVarValues(e.target.value) })} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {v.values.length} valor(es){v.mode === "rotate" ? " · alterna entre os contatos e volta ao primeiro depois do último. Use só para textos que podem variar livremente, nunca para dados reais da pessoa." : ""}
                      {v.name.trim() && !used ? ` · ainda não aparece no texto como (${v.name.trim()}).` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div><Label>Botões</Label>
            <Select value={buttonsType} onValueChange={(v) => { setButtonsType(v as DirectButtonsType); setTestResult(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (texto simples)</SelectItem>
                <SelectItem value="url">Botão de URL (1)</SelectItem>
                <SelectItem value="reply">Botões de resposta (até 3)</SelectItem>
                <SelectItem value="mixed" disabled>URL + respostas (em breve)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              A Meta aceita URL e respostas juntos (até 10 botões, no máximo 2 de URL, URL primeiro), mas o formato oficial
              ainda não foi confirmado — por isso essa opção está desligada. Cabeçalho e rodapé só existem com botões.
            </p>
          </div>
          {buttonsType === "url" && (
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Texto do botão</Label><Input maxLength={20} value={urlBtn.text} onChange={(e) => setUrlBtn({ ...urlBtn, text: e.target.value })} /></div>
              <div className="col-span-2"><Label>URL de destino</Label><Input value={urlBtn.url} onChange={(e) => setUrlBtn({ ...urlBtn, url: e.target.value })} /></div>
            </div>
          )}
          {buttonsType === "reply" && (
            <div className="space-y-2">
              {replies.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div><Label>Texto da resposta {i + 1}</Label><Input maxLength={20} value={r.title} onChange={(e) => setReplies(replies.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} /></div>
                  <div><Label>Identificação no webhook</Label><Input maxLength={256} value={r.id} onChange={(e) => setReplies(replies.map((x, j) => j === i ? { ...x, id: e.target.value } : x))} /></div>
                  <Button type="button" variant="ghost" size="icon" disabled={replies.length === 1} onClick={() => setReplies(replies.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {replies.length < 3 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setReplies([...replies, { id: `opcao_${replies.length + 1}`, title: "" }])}><Plus className="mr-1 h-4 w-4" />Adicionar resposta</Button>
              )}
            </div>
          )}
          <div className="space-y-2 rounded-lg border p-3">
            <Label>Respostas automáticas (automação)</Label>
            <p className="text-xs text-muted-foreground">Quando o lead tocar num botão ou responder, a automação escolhida continua a conversa: envia outra mensagem, segue o fluxo ou encaminha para atendimento. Um fluxo por lead neste disparo.</p>
            <Select value={automationId || "__none__"} onValueChange={(v) => setAutomationId(v === "__none__" ? "" : v)} disabled={!connId}>
              <SelectTrigger><SelectValue placeholder={connId ? "Escolha" : "Escolha o número primeiro"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma</SelectItem>
                {(replyAutosQ.data ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}{a.status !== "active" ? " (não publicada — não responde)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!connId} onClick={createFlow}>Criar fluxo a partir dos botões</Button>
              {automationId && <Button type="button" size="sm" variant="ghost" onClick={() => window.open(`/admin/automacoes/${automationId}`, "_blank")}>Abrir no editor</Button>}
            </div>
            {automationId && (replyAutosQ.data ?? []).find((a: any) => a.id === automationId)?.status !== "active" && (
              <p className="text-xs text-destructive">Publique a automação antes do envio; senão as respostas não serão tratadas por ela.</p>
            )}
          </div>
          {interactive && (
            <>
              <div><Label>Cabeçalho</Label>
                <Select value={headerType} onValueChange={(v) => { setHeaderType(v as DirectHeaderType); setMedia(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {headerType === "text" && <div><Label>Texto do cabeçalho</Label><Input maxLength={60} value={headerText} onChange={(e) => setHeaderText(e.target.value)} /></div>}
              {(headerType === "image" || headerType === "video") && (
                <div>
                  <Label>{headerType === "image" ? `Imagem (JPG/PNG, até ${IMAGE_MAX_MB}MB)` : `Vídeo (MP4/3GP, até ${VIDEO_MAX_MB}MB)`}</Label>
                  <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {media ? "Trocar arquivo" : "Enviar arquivo"}
                    <input type="file" className="hidden" accept={(headerType === "image" ? IMAGE_MIME : VIDEO_MIME).join(",")}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
                  </label>
                </div>
              )}
              <div><Label>Rodapé (opcional)</Label><Input maxLength={60} value={footer} onChange={(e) => setFooter(e.target.value)} /></div>
            </>
          )}
          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={pacingOn} onChange={(e) => setPacingOn(e.target.checked)} />
              Ritmo de envio (ciclos com quantidades, intervalos e pausas sorteados)
            </label>
            {pacingOn && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Mensagens por ciclo — mín.</Label><Input type="number" min={1} value={pace.msgs_min} onChange={(e) => setPace({ ...pace, msgs_min: e.target.value })} /></div>
                  <div><Label>Mensagens por ciclo — máx.</Label><Input type="number" min={1} value={pace.msgs_max} onChange={(e) => setPace({ ...pace, msgs_max: e.target.value })} /></div>
                  <div><Label>Intervalo entre mensagens — mín. (s)</Label><Input type="number" min={1} value={pace.interval_min_s} onChange={(e) => setPace({ ...pace, interval_min_s: e.target.value })} /></div>
                  <div><Label>Intervalo entre mensagens — máx. (s)</Label><Input type="number" min={1} value={pace.interval_max_s} onChange={(e) => setPace({ ...pace, interval_max_s: e.target.value })} /></div>
                  <div><Label>Pausa entre ciclos — mín.</Label><Input type="number" min={0} value={pace.pause_min} onChange={(e) => setPace({ ...pace, pause_min: e.target.value })} /></div>
                  <div><Label>Pausa entre ciclos — máx.</Label><Input type="number" min={0} value={pace.pause_max} onChange={(e) => setPace({ ...pace, pause_max: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span>Unidade da pausa:</span>
                  <Select value={pauseUnit} onValueChange={(v) => setPauseUnit(v as "s" | "min")}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="s">segundos</SelectItem><SelectItem value="min">minutos</SelectItem></SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  A cada ciclo é sorteada a quantidade de mensagens; antes de cada envio, um novo intervalo; ao fim do ciclo, uma nova pausa.
                  Envio uma mensagem por vez. Limites e erros da Meta continuam valendo e podem pausar a demanda.
                </p>
              </>
            )}
          </div>
          {errors.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          {draftId && <p className="text-xs text-muted-foreground">Editando rascunho salvo{draftQ.isFetching ? " (carregando…)" : ""}.</p>}
          <Button variant="outline" className="w-full" disabled={!name.trim() || errors.length > 0 || save.isPending || uploading} onClick={() => save.mutate()}>
            <Save className="mr-2 h-4 w-4" />{draftId ? "Salvar alterações" : "Salvar rascunho"}
          </Button>
          <div><Label>Agendar (opcional)</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <Button className="w-full" disabled={!ready || launch.isPending || blocked} onClick={() => launch.mutate()}>
            <Rocket className="mr-2 h-4 w-4" />{when ? "Agendar demanda" : "Iniciar demanda"}
          </Button>
          {blocked && <p className="text-sm text-destructive">Direct Send não está habilitado para esta conta. Escolha outra conta — não há troca automática para template.</p>}
        </div>
        <div className="space-y-3">
          {draftId && <PacingPanel id={draftId} />}
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Prévia{cleanVars.length ? ` — contato ${previewIdx + 1}` : ""}</span>
              {cleanVars.length > 0 && (
                <span className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={previewIdx === 0} onClick={() => setPreviewIdx((n) => n - 1)}>Anterior</Button>
                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setPreviewIdx((n) => n + 1)}>Próximo</Button>
                </span>
              )}
            </div>
            <WhatsAppPreview
              body={previewBody(previewIdx)}
              header={effHeader === "none" ? null : { type: effHeader, text: headerText, media_url: media?.previewUrl }}
              footer={interactive ? footer : null}
              buttons={buttonsType === "url" ? [{ type: "url", text: urlBtn.text }] : buttonsType === "reply" ? replies.map((r) => ({ type: "reply", text: r.title })) : []}
            />
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="text-sm font-medium">Envio de teste</div>
            <p className="text-xs text-muted-foreground">Use uma atualização real sobre uma transação do destinatário.</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="5562999999999" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Input placeholder="Nome (opcional)" value={testName} onChange={(e) => setTestName(e.target.value)} />
            </div>
            <Button variant="secondary" disabled={!connId || !testTo || errors.length > 0 || uploading || test.isPending} onClick={() => test.mutate()}>
              <Send className="mr-2 h-4 w-4" />Enviar teste
            </Button>
            {testResult && (
              <div className="space-y-2 text-xs" data-testid="test-result">
                {testResult.upload && (
                  <div className="space-y-1 rounded border p-2">
                    <div className={testResult.upload.ok ? "text-primary" : "text-destructive"}>
                      <b>1. Link temporário da mídia:</b> {testResult.upload.ok ? `gerado (${testResult.upload.mime}, válido por ${Math.round((testResult.upload.expires_in ?? 0) / 3600)}h; teste de acesso: HTTP ${testResult.upload.link_http ?? "?"} ${testResult.upload.link_type ?? ""})` : `erro — ${testResult.upload.error}`}
                    </div>
                    {testResult.upload.ok && testResult.upload.link_in_payload !== undefined && (
                      <div className={testResult.upload.link_in_payload ? "text-primary" : "text-destructive"}>
                        <b>Link na mensagem final:</b> {testResult.upload.link_in_payload ? `sim, em ${testResult.upload.header_path}` : "NÃO"}
                      </div>
                    )}
                    {!testResult.upload.ok && testResult.upload.raw && <pre className="max-h-40 overflow-auto rounded bg-muted p-2">{JSON.stringify(testResult.upload.raw, null, 2)}</pre>}
                  </div>
                )}
                {testResult.meta && (
                  <div className={testResult.ok ? "text-primary" : "text-destructive"}>
                    <b>{testResult.upload ? "2. " : ""}Envio da mensagem:</b> {testResult.ok ? `aceito (wamid ${testResult.wamid})` : `erro ${testResult.code ?? ""} — ${testResult.error}`}
                  </div>
                )}
                {testResult.meta && (
                  <div className={testResult.matches_preview ? "text-primary" : "text-destructive"}>
                    <b>Payload x prévia:</b> {testResult.matches_preview ? "idênticos (cabeçalho, corpo e botões incluídos)" : (testResult.mismatches ?? []).join("; ")}
                  </div>
                )}
                {testResult.internal_error && <div className="text-muted-foreground"><b>Erro interno (registro do teste, não afeta o envio):</b> {testResult.internal_error}</div>}
                <div className="font-medium">Payload final enviado à Meta (número parcialmente oculto; o token nunca faz parte do payload)</div>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2">{JSON.stringify(testResult.payload, null, 2)}</pre>
                {!testResult.ok && testResult.meta?.raw && (<><div className="font-medium">Resposta da Meta</div><pre className="max-h-40 overflow-auto rounded bg-muted p-2">{JSON.stringify(testResult.meta.raw, null, 2)}</pre></>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
