import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyContext } from "@/lib/auth.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listMyNumbers, listMyTemplates, createClientCampaign } from "@/lib/client-panel.functions";
import { listWorkspaceLists, createWorkspaceListWithPhones } from "@/lib/wa-wizard-lists.functions";
import { metaVarsIn } from "@/lib/wa-variables";
import { DDD_TO_CITY, extractDddBR } from "@/lib/ddd-cities";
import {
  ArrowLeft, Loader2, Upload, User, Phone, Video, MoreVertical, Mic, ChevronLeft,
  Signal, Wifi, BatteryMedium, CheckCheck, Tags, ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/painel/campanhas/nova")({
  head: () => ({
    meta: [
      { title: "Novo Disparo — Painel" },
      { name: "description", content: "Crie um novo disparo de WhatsApp com preview ao vivo da mensagem." },
    ],
  }),
  component: Page,
});

type NumberRow = { id: string; display_name: string; phone_masked: string; status: string };
type TemplateRow = {
  id: string; name: string; language: string; category: string; body: string;
  header_type?: string | null; header_text?: string | null; footer?: string | null; buttons?: any[];
};
type ContactMode = "manual" | "lista" | "csv";

function fillVars(text: string, vars: Record<string, string>) {
  return (text || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => vars[String(n)] || m);
}

const MESSAGE_PRESETS = [
  {
    id: "novidade",
    label: "Modelo 1 · Novidade",
    body: "Olá {{1}}!\n\nTemos uma novidade: {{2}}.\n\n{{3}}.\n\nPara {{4}}, use o botão abaixo 👇",
  },
  {
    id: "informativo",
    label: "Modelo 2 · Informativo",
    body: "Olá {{1}}!\n\nInformamos que {{2}}.\n\n{{3}}.\n\nPara {{4}}, clique no botão logo abaixo 👇",
  },
] as const;


function Page() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const workspaceId = ctx?.primary_workspace?.id ?? "";
  const navigate = useNavigate();

  const fnNumbers = useServerFn(listMyNumbers);
  const fnTemplates = useServerFn(listMyTemplates);
  const fnLists = useServerFn(listWorkspaceLists);
  const fnCreateList = useServerFn(createWorkspaceListWithPhones);
  const fnCreate = useServerFn(createClientCampaign);

  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [lists, setLists] = useState<Array<{ id: string; name: string; count: number }>>([]);

  const [name, setName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [bio, setBio] = useState("");
  const [message, setMessage] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [btnVars, setBtnVars] = useState<Record<string, string>>({});
  const [btnEnabled, setBtnEnabled] = useState(true);
  const [btnText, setBtnText] = useState("CLIQUE AQUI");
  const [btnUrl, setBtnUrl] = useState("");

  const [mode, setMode] = useState<ContactMode>("manual");
  const [manual, setManual] = useState("");
  const [listId, setListId] = useState("");
  const [csvRows, setCsvRows] = useState<Array<{ phone: string; name?: string }>>([]);
  const [csvName, setCsvName] = useState("");
  const [ddd, setDdd] = useState("any");

  const [avatarUrl, setAvatarUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploading, setUploading] = useState<"avatar" | "media" | null>(null);

  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspaceId) return;
    fnNumbers({ data: { workspace_id: workspaceId } })
      .then((r: any) => { setNumbers(r.numbers); if (r.numbers.length > 0) setConnectionId(r.numbers[0].id); })
      .catch(() => {});
    fnLists({ data: { workspace_id: workspaceId, only_mine: true } }).then((r: any) => setLists(r.lists)).catch(() => {});
  }, [workspaceId, fnNumbers, fnLists]);

  useEffect(() => {
    if (!connectionId) { setTemplates([]); return; }
    fnTemplates({ data: { workspace_id: workspaceId, connection_id: connectionId } })
      .then((r: any) => { setTemplates(r.templates); if (r.templates.length > 0) setTemplateId(r.templates[0].id); })
      .catch(() => setTemplates([]));
  }, [connectionId, workspaceId, fnTemplates]);

  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);
  const bodyVars = useMemo(() => metaVarsIn(message), [message]);
  const urlButton = useMemo(
    () => (template?.buttons ?? []).find((b: any) => String(b?.type).toUpperCase() === "URL"),
    [template],
  );
  const urlVars = useMemo(() => (urlButton?.url ? metaVarsIn(String(urlButton.url)) : []), [urlButton]);

  // Modelos de mensagem disponíveis (apenas dois).
  useEffect(() => {
    if (!message) setMessage(MESSAGE_PRESETS[0].body);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const manualRows = useMemo(() => {
    return manual.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [phone, nome] = l.split(/[;,]/);
      return { phone: (phone || "").replace(/\D/g, ""), name: (nome || "").trim() || undefined };
    }).filter((r) => r.phone.length >= 10);
  }, [manual]);

  const audienceCount = mode === "manual" ? manualRows.length
    : mode === "csv" ? csvRows.length
    : (lists.find((l) => l.id === listId)?.count ?? 0);

  const previewBody = fillVars(message, vars);
  const previewUrl = btnEnabled ? btnUrl : (urlButton?.url ? fillVars(String(urlButton.url), btnVars) : "");

  async function upload(file: File, kind: "avatar" | "media") {
    setUploading(kind);
    try {
      const key = `${workspaceId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("campaign-images").upload(key, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data: signed, error: sErr } = await supabase.storage.from("campaign-images").createSignedUrl(key, 60 * 60 * 24 * 7);
      if (sErr) throw sErr;
      if (kind === "avatar") setAvatarUrl(signed.signedUrl); else setMediaUrl(signed.signedUrl);
      toast.success("Arquivo enviado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(null);
    }
  }

  function onCsv(file: File) {
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result || "")
        .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        .map((l) => {
          const parts = l.split(/[;,]/);
          return { phone: (parts[0] || "").replace(/\D/g, ""), name: (parts[1] || "").trim() || undefined };
        })
        .filter((r) => r.phone.length >= 10);
      setCsvRows(rows);
      toast.success(`${rows.length} contatos detectados`);
    };
    reader.readAsText(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Informe o nome da campanha");
    if (!connectionId) return toast.error("Selecione o número de envio");
    if (!templateId) return toast.error("Selecione o template aprovado");
    if (!audienceCount) return toast.error("Adicione os contatos do disparo");
    if (btnEnabled && !/^https?:\/\/.+/i.test(btnUrl.trim())) return toast.error("Informe o destino (link) do botão");
    if (schedule && (!date || !time)) return toast.error("Informe data e hora do agendamento");

    setSubmitting(true);
    try {
      let finalListId = listId;
      if (mode !== "lista") {
        const rows = mode === "manual" ? manualRows : csvRows;
        const created: any = await fnCreateList({
          data: { workspace_id: workspaceId, name: `${name.trim()} — contatos`, source: "novo-disparo", rows },
        });
        finalListId = created.list_id;
      }

      const scheduled_at = schedule ? new Date(`${date}T${time}`).toISOString() : null;
      const campaign: any = await fnCreate({
        data: {
          workspace_id: workspaceId,
          name: name.trim(),
          connection_id: connectionId,
          template_id: templateId,
          list_id: finalListId,
          variables_mapping: vars,
          button_url_mapping: btnEnabled ? { ...btnVars, "1": btnUrl.trim() } : btnVars,
          header_media_url: mediaUrl || null,
          scheduled_at,
        },
      });
      toast.success(scheduled_at ? "Disparo agendado — aguardando aprovação" : "Disparo enviado para a fila — aguardando aprovação");
      navigate({ to: "/painel/campanhas" });
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível criar o disparo");
    } finally {
      setSubmitting(false);
    }
  }

  const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/painel/campanhas" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Meus Disparos
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Novo Disparo</h1>
          <p className="text-sm text-muted-foreground">Preencha os dados da campanha e acompanhe o preview ao vivo.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Formulário ── */}
        <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
          <Field label="Nome da campanha">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex: Campanha de Black Friday" required />
          </Field>

          <Field label="Nome do perfil">
            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} maxLength={50} placeholder="Ex: Loja Virtual" />
          </Field>

          <Field label="Biografia do perfil" hint="Máximo de 139 caracteres (limite do WhatsApp).">
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={139} rows={3} placeholder="Ex: Atendimento oficial - Seg a Sex das 9h às 18h" />
          </Field>

          <div className="space-y-3">
            <Label>Modelo de mensagem</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {MESSAGE_PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => { setMessage(p.body); setVars({}); }}
                  className={`rounded-xl border p-3 text-left text-xs whitespace-pre-line transition ${message === p.body ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <span className="mb-1 block text-sm font-medium">{p.label}</span>
                  <span className="text-muted-foreground">{p.body}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Mensagem" hint={"Use as variáveis do modelo como {{1}} e {{2}}."}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} maxLength={2000}
              placeholder="Digite aqui o texto da sua campanha." required />
          </Field>

          {bodyVars.length > 0 && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Tags className="h-4 w-4" /> Valores das variáveis</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {bodyVars.map((v) => (
                  <Field key={v} label={`Variável {{${v}}}`}>
                    <Input value={vars[v] ?? ""} onChange={(e) => setVars((s) => ({ ...s, [v]: e.target.value }))} placeholder="Ex: {nome}" />
                  </Field>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label>Selecione a base de contatos</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["manual", "Digitar números manualmente"],
                ["lista", "Usar lista de leads"],
                ["csv", "Anexar Excel / CSV"],
              ] as Array<[ContactMode, string]>).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setMode(k)}
                  className={`rounded-xl border p-3 text-left text-sm transition ${mode === k ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/50"}`}>
                  {label}
                </button>
              ))}
            </div>

            {mode === "manual" && (
              <Field label="Números manualmente:" hint="Apenas dígitos. Um contato por linha — Formato: Número;Nome">
                <Textarea value={manual} onChange={(e) => setManual(e.target.value)} rows={8}
                  placeholder={"Cole ou digite os dados aqui, um contato por linha.\nEx: 5511999998888;João da Silva"} />
              </Field>
            )}

            {mode === "lista" && (
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger><SelectValue placeholder="Selecione uma base de contatos..." /></SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name} · {l.count.toLocaleString("pt-BR")} contatos</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {mode === "csv" && (
              <Field label="Anexar arquivo CSV" hint="Formato do arquivo (sem cabeçalho): NUMERO | NOME">
                <Input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); }} />
                {csvName && <p className="mt-2 text-xs text-muted-foreground">{csvName} · {csvRows.length} contatos detectados</p>}
              </Field>
            )}

            <p className="text-xs text-muted-foreground">{audienceCount.toLocaleString("pt-BR")} contatos selecionados</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Foto de perfil">
              <input ref={avatarInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "avatar"); }} />
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => avatarInput.current?.click()} disabled={uploading === "avatar"}>
                {uploading === "avatar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {avatarUrl ? "Trocar foto" : "Enviar foto"}
              </Button>
            </Field>
            <Field label="Mídia (imagem, vídeo ou áudio)">
              <input ref={mediaInput} type="file" accept="image/*,video/*,audio/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "media"); }} />
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => mediaInput.current?.click()} disabled={uploading === "media"}>
                {uploading === "media" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {mediaUrl ? "Trocar mídia" : "Anexar mídia"}
              </Button>
            </Field>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={btnEnabled} onCheckedChange={(v) => setBtnEnabled(!!v)} />
              <ExternalLink className="h-4 w-4" /> Adicionar botão
            </label>
            {btnEnabled && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Nome do botão">
                  <Input value={btnText} onChange={(e) => setBtnText(e.target.value)} placeholder="CLIQUE AQUI" />
                </Field>
                <Field label="Destino do botão (link)">
                  <Input value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} placeholder="Ex: https://www.seusite.com.br" />
                </Field>
              </div>
            )}
          </div>


          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={schedule} onCheckedChange={(v) => setSchedule(!!v)} /> Agendar envio
          </label>
          {schedule && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data de envio"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Hora de envio"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            </div>
          )}

          <Button type="submit" className="h-11 w-full rounded-xl" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {schedule ? "Agendar campanha" : "Enviar campanha"}
          </Button>
        </form>

        {/* ── Preview ao vivo ── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-2 text-sm font-medium text-muted-foreground">Preview ao vivo</div>
          <div className="overflow-hidden rounded-[2rem] border-4 border-neutral-800 bg-neutral-900 shadow-xl">
            <div className="flex items-center justify-between px-4 py-1.5 text-[10px] text-white">
              <span>{now}</span>
              <span className="flex items-center gap-1"><Signal className="h-3 w-3" /><Wifi className="h-3 w-3" /><BatteryMedium className="h-3.5 w-3.5" /></span>
            </div>
            <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2 text-white">
              <ChevronLeft className="h-4 w-4" />
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20">
                {avatarUrl ? <img src={avatarUrl} alt="Foto do perfil" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{profileName || "Atendimento"}</div>
                <div className="truncate text-[10px] opacity-80">{bio || "online"}</div>
              </div>
              <Video className="h-4 w-4" /><Phone className="h-4 w-4" /><MoreVertical className="h-4 w-4" />
            </div>

            <div className="min-h-[380px] space-y-2 bg-[#e5ddd5] p-3 dark:bg-neutral-800">
              <div className="mx-auto w-fit rounded bg-white/70 px-2 py-0.5 text-[10px] text-neutral-600">Hoje</div>
              <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white p-2 shadow-sm">
                {mediaUrl && (
                  <img src={mediaUrl} alt="Mídia da campanha" className="mb-2 aspect-video w-full rounded object-cover" />
                )}
                {template?.header_text && <div className="mb-1 text-sm font-bold text-neutral-900">{template.header_text}</div>}
                <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-900">
                  {previewBody || <span className="italic text-neutral-400">Sua mensagem aparece aqui...</span>}
                </div>
                {template?.footer && <div className="mt-1 text-[10px] text-neutral-500">{template.footer}</div>}
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-500">
                  {now} <CheckCheck className="h-3 w-3 text-sky-500" />
                </div>
              </div>
              {btnEnabled ? (
                <div className="max-w-[85%]">
                  <div className="rounded-lg bg-white py-1.5 text-center text-[12px] font-medium text-sky-600 shadow-sm">
                    {btnText || "CLIQUE AQUI"}
                  </div>
                </div>
              ) : (template?.buttons ?? []).length > 0 && (
                <div className="max-w-[85%] space-y-1">
                  {(template!.buttons as any[]).map((b, i) => (
                    <div key={i} className="rounded-lg bg-white py-1.5 text-center text-[12px] font-medium text-sky-600 shadow-sm">
                      {b.text}
                    </div>
                  ))}
                </div>
              )}

            </div>

            <div className="flex items-center gap-2 bg-[#f0f0f0] px-3 py-2">
              <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-neutral-400">Mensagem</div>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#075E54] text-white"><Mic className="h-4 w-4" /></span>
            </div>
          </div>
          {previewUrl && <p className="mt-2 break-all text-[11px] text-muted-foreground">Link do botão: {previewUrl}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
