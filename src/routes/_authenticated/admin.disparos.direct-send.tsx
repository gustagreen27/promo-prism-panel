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
} from "@/lib/direct-send";
import { NewContactListDialog } from "@/components/campaigns/NewContactListDialog";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
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
  return text.replace(/\{\{\s*nome\s*\}\}|\{\s*nome\s*\}/gi, nome || "cliente");
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
  };
  const errors = validateDirectConfig(text, config);

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
    const payload = { name, connection_id: connId, list_id: listId, send_mode: "direct_utility", direct_text: text, direct_config: config, participants: [] } as any;
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
          <div><Label>Mensagem (use {"{nome}"} para o nome do contato)</Label>
            <Textarea rows={6} maxLength={BODY_MAX} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">{text.length}/{BODY_MAX}</p>
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
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Prévia</div>
            <WhatsAppPreview
              body={render(text, testName)}
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
                      <b>1. Upload da mídia:</b> {testResult.upload.ok ? `ok — id ${testResult.upload.media_id} (${testResult.upload.mime}, ${testResult.upload.bytes ?? "?"} bytes)` : `erro ${testResult.upload.code ?? ""} — ${testResult.upload.error}`}
                    </div>
                    {testResult.upload.inspect && (
                      <div className={testResult.upload.inspect.recognized ? "text-primary" : "text-destructive"}>
                        <b>Consulta do id na Meta:</b> {testResult.upload.inspect.recognized ? `reconhecido (${testResult.upload.inspect.mime_type}, ${testResult.upload.inspect.file_size} bytes)` : `não reconhecido — ${testResult.upload.inspect.error}`}
                      </div>
                    )}
                    {testResult.upload.ok && testResult.upload.id_in_payload !== undefined && (
                      <div className={testResult.upload.id_in_payload ? "text-primary" : "text-destructive"}>
                        <b>id no payload final:</b> {testResult.upload.id_in_payload ? `sim, em ${testResult.upload.header_path}` : "NÃO — o id do upload não chegou ao payload"}
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
