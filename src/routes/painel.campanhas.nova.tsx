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
import { createClientCampaign } from "@/lib/client-panel.functions";
import { listWorkspaceLists, createWorkspaceListWithPhones } from "@/lib/wa-wizard-lists.functions";
import { metaVarsIn } from "@/lib/wa-variables";
import { DDD_TO_CITY, extractDddBR } from "@/lib/ddd-cities";
import {
  ArrowLeft, Loader2, Upload, User, Phone, Video, MoreVertical, Mic, ChevronLeft,
  Signal, Wifi, BatteryMedium, CheckCheck, Tags, ExternalLink, Rocket, Tag, Braces,
  Link2, Check, FileSpreadsheet, ListChecks, Sparkles,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ContactImportDialog, parseContactFile, type ParsedSheet } from "@/components/import/ContactImportDialog";
import { buildImportSummary, type ImportSummary } from "@/lib/phone-normalize";



export const Route = createFileRoute("/painel/campanhas/nova")({
  head: () => ({
    meta: [
      { title: "Novo Disparo — Painel" },
      { name: "description", content: "Crie um novo disparo de WhatsApp com preview ao vivo da mensagem." },
    ],
  }),
  component: Page,
});

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

  const fnLists = useServerFn(listWorkspaceLists);
  const fnCreateList = useServerFn(createWorkspaceListWithPhones);
  const fnCreate = useServerFn(createClientCampaign);

  const [lists, setLists] = useState<Array<{ id: string; name: string; count: number }>>([]);

  const [name, setName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [bio, setBio] = useState("");
  const [message, setMessage] = useState("");
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
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [csvSummary, setCsvSummary] = useState<ImportSummary | null>(null);

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
    fnLists({ data: { workspace_id: workspaceId, only_mine: true } }).then((r: any) => setLists(r.lists)).catch(() => {});
  }, [workspaceId, fnLists]);

  const bodyVars = useMemo(() => metaVarsIn(message), [message]);

  // Modelos de mensagem disponíveis (apenas dois).
  useEffect(() => {
    if (!message) setMessage(MESSAGE_PRESETS[0].body);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const manualRows = useMemo(() => {
    const raw = manual.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [phone, nome] = l.split(/[;,]/);
      return { phone: phone || "", name: (nome || "").trim() || undefined };
    });
    return buildImportSummary(raw).rows;
  }, [manual]);


  const dddFilter = ddd === "any" ? null : ddd;
  const byDdd = <T extends { phone: string }>(rows: T[]) =>
    dddFilter ? rows.filter((r) => extractDddBR(r.phone) === dddFilter) : rows;

  const manualFiltered = useMemo(() => byDdd(manualRows), [manualRows, dddFilter]);
  const csvFiltered = useMemo(() => byDdd(csvRows), [csvRows, dddFilter]);

  const audienceCount = mode === "manual" ? manualFiltered.length
    : mode === "csv" ? csvFiltered.length
    : (lists.find((l) => l.id === listId)?.count ?? 0);

  const previewBody = fillVars(message, vars);
  const previewUrl = btnEnabled ? btnUrl : "";

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

  async function onCsv(file: File) {
    try {
      const parsed = await parseContactFile(file);
      if (!parsed.headers.length) return toast.error("Arquivo vazio ou ilegível");
      setSheet(parsed);
      setMapOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ler o arquivo");
    }
  }


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Informe o nome da campanha");
    if (!audienceCount) return toast.error("Adicione os contatos do disparo");
    if (btnEnabled && !/^https?:\/\/.+/i.test(btnUrl.trim())) return toast.error("Informe o destino (link) do botão");
    if (schedule && (!date || !time)) return toast.error("Informe data e hora do agendamento");

    setSubmitting(true);
    try {
      let finalListId = listId;
      if (mode !== "lista") {
        const rows = mode === "manual" ? manualFiltered : csvFiltered;
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
          connection_id: null,
          template_id: null,
          list_id: finalListId,
          ddd_filter: mode === "lista" ? dddFilter : null,
          variables_mapping: vars,
          button_url_mapping: btnEnabled ? { ...btnVars, "1": btnUrl.trim() } : btnVars,
          header_media_url: mediaUrl || null,
          client_brief: {
            message,
            profile_name: profileName || null,
            bio: bio || null,
            avatar_url: avatarUrl || null,
            media_url: mediaUrl || null,
            button_enabled: btnEnabled,
            button_text: btnEnabled ? btnText : null,
            button_url: btnEnabled ? btnUrl.trim() : null,
            variables: vars,
            recipients_source: mode,
            recipients_count: audienceCount,
            ddd_filter: dddFilter,
          },
          scheduled_at,
        },
      });
      toast.success(scheduled_at ? "Campanha agendada e enviada ao administrador" : "Campanha enviada ao administrador — aguardando envio");
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
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Rocket className="h-6 w-6" />
        </span>
        <div className="min-w-0">
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
            <IconInput icon={Tag}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="pl-9" placeholder="Ex: Campanha de Black Friday" required />
            </IconInput>
          </Field>


          <Field label="Nome do perfil">
            <IconInput icon={User}>
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} maxLength={50} className="pl-9" placeholder="Ex: Loja Virtual" />
            </IconInput>
          </Field>

          <Field label="Biografia do perfil" hint="Máximo de 139 caracteres (limite do WhatsApp)." counter={`${bio.length}/139`}>
            <IconInput icon={Tag} align="top">
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={139} rows={3} className="pl-9" placeholder="Ex: Atendimento oficial - Seg a Sex das 9h às 18h" />
            </IconInput>
          </Field>

          <div className="space-y-3">
            <Label>Modelo de mensagem</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {MESSAGE_PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => { setMessage(p.body); setVars({}); }}
                  className={`relative rounded-xl border p-3 pr-9 text-left text-xs whitespace-pre-line transition ${message === p.body ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}>
                  <span className={`absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full border ${message === p.body ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                    {message === p.body && <Check className="h-3 w-3" />}
                  </span>
                  <span className="mb-1 block text-sm font-medium">{p.label}</span>

                  <span className="text-muted-foreground">{p.body}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Mensagem" hint={"Use as variáveis do modelo como {{1}} e {{2}}."}>
            <div className="relative">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} maxLength={2000}
                placeholder="Digite aqui o texto da sua campanha." required />
              <Sparkles className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-primary/70" />
            </div>
          </Field>

          {bodyVars.length > 0 && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Tags className="h-4 w-4" /> Valores das variáveis</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {bodyVars.map((v) => (
                  <Field key={v} label={`Variável {{${v}}}`}>
                    <IconInput icon={Braces}>
                      <Input value={vars[v] ?? ""} onChange={(e) => setVars((s) => ({ ...s, [v]: e.target.value }))} className="pl-9" placeholder="Ex: {nome}" />
                    </IconInput>
                  </Field>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label>Selecione a base de contatos</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["manual", "Digitar números manualmente", User],
                ["lista", "Usar lista de leads", ListChecks],
                ["csv", "Anexar Excel / CSV", FileSpreadsheet],
              ] as Array<[ContactMode, string, typeof User]>).map(([k, label, Icon]) => (
                <button key={k} type="button" onClick={() => setMode(k)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-center text-sm transition ${mode === k ? "border-primary bg-primary/5 font-medium text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                  <Icon className="h-4 w-4 shrink-0" /> {label}
                </button>
              ))}
            </div>

            {mode === "manual" && (
              <Field label="Números manualmente" hint="Apenas dígitos. Um contato por linha — Formato: Número;Nome">
                <div className="relative">
                  <Textarea value={manual} onChange={(e) => setManual(e.target.value)} rows={8}
                    placeholder={"Cole ou digite os dados aqui, um contato por linha.\nEx: 5511999998888;João da Silva"} />
                  <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-muted-foreground">
                    {manualRows.length} contatos
                  </span>
                </div>
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
              <Field label="Anexar Excel (.xlsx) ou CSV" hint="Após anexar você escolhe as colunas de nome e número; os números são padronizados para 55DDDNÚMERO.">
                <Input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ""; }} />
                {csvName && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {csvName} · {csvRows.length.toLocaleString("pt-BR")} contatos válidos
                    {csvSummary ? ` · ${csvSummary.fixed} corrigidos · ${csvSummary.duplicates} duplicados · ${csvSummary.invalid} inválidos` : ""}
                    {sheet && <button type="button" className="ml-2 underline" onClick={() => setMapOpen(true)}>revisar mapeamento</button>}
                  </p>
                )}
              </Field>
            )}


            <Field label="DDD de envio" hint="Escolha “Qualquer” para enviar a todos os DDDs.">
              <Select value={ddd} onValueChange={setDdd}>
                <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="any">Qualquer</SelectItem>
                  {Object.keys(DDD_TO_CITY).sort().map((d) => (
                    <SelectItem key={d} value={d}>+{d} · {DDD_TO_CITY[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <p className="text-right text-xs text-muted-foreground">
              {audienceCount.toLocaleString("pt-BR")} contatos selecionados
              {dddFilter ? ` · filtrando DDD +${dddFilter}` : ""}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Foto de perfil">
              <input ref={avatarInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "avatar"); }} />
              <Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => avatarInput.current?.click()} disabled={uploading === "avatar"}>
                {uploading === "avatar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {avatarUrl ? "Trocar foto" : "Enviar foto"}
              </Button>
            </Field>
            <Field label="Mídia (imagem, vídeo ou áudio)">
              <input ref={mediaInput} type="file" accept="image/*,video/*,audio/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "media"); }} />
              <Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => mediaInput.current?.click()} disabled={uploading === "media"}>
                {uploading === "media" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {mediaUrl ? "Trocar mídia" : "Anexar mídia"}
              </Button>
            </Field>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-3 text-sm font-medium">
              <Switch checked={btnEnabled} onCheckedChange={setBtnEnabled} />
              <span className="flex items-center gap-2"><ExternalLink className="h-4 w-4" /> Adicionar botão</span>
            </div>
            {btnEnabled && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Nome do botão">
                  <IconInput icon={Tag}>
                    <Input value={btnText} onChange={(e) => setBtnText(e.target.value)} className="pl-9" placeholder="CLIQUE AQUI" />
                  </IconInput>
                </Field>
                <Field label="Destino do botão (link)">
                  <IconInput icon={Link2}>
                    <Input value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} className="pl-9" placeholder="Ex: https://www.seusite.com.br" />
                  </IconInput>
                </Field>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm font-medium">
            <Switch checked={schedule} onCheckedChange={setSchedule} /> Agendar envio
          </div>
          {schedule && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data de envio"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Hora de envio"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            </div>
          )}

          <Button type="submit" className="h-12 w-full rounded-xl text-base" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {schedule ? "Agendar campanha" : "Enviar campanha"}
          </Button>

        </form>

        {/* ── Preview ao vivo ── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <span className="truncate text-sm font-semibold">Preview ao vivo</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Atualizado agora
              </span>
            </div>
            <div className="mx-auto max-w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-neutral-900 bg-neutral-900 shadow-xl">
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

              <div className="min-h-[380px] space-y-2 bg-[#e7dfd6] p-3">
                <div className="mx-auto w-fit rounded bg-white/70 px-2 py-0.5 text-[10px] text-neutral-600">Hoje</div>
                <div className="max-w-[88%] rounded-lg rounded-tl-none bg-white p-2 shadow-sm">
                  {mediaUrl && (
                    <img src={mediaUrl} alt="Mídia da campanha" className="mb-2 aspect-video w-full rounded object-cover" />
                  )}
                  <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-900">
                    {previewBody || <span className="italic text-neutral-400">Sua mensagem aparece aqui...</span>}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-500">
                    {now} <CheckCheck className="h-3 w-3 text-sky-500" />
                  </div>
                </div>
                {btnEnabled && (
                  <div className="max-w-[88%]">
                    <div className="rounded-lg bg-white py-2 text-center text-[12px] font-semibold text-sky-600 shadow-sm">
                      {btnText || "CLIQUE AQUI"}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 bg-[#f0f0f0] px-3 py-2">
                <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-neutral-400">Mensagem</div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#00a884] text-white"><Mic className="h-4 w-4" /></span>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              A visualização é aproximada e pode variar no WhatsApp real.
            </p>
            {previewUrl && <p className="mt-2 break-all text-center text-[11px] text-muted-foreground">Link do botão: {previewUrl}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, hint, counter, children,
}: { label: string; hint?: string; counter?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {(hint || counter) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs text-muted-foreground">
          <span className="min-w-0">{hint}</span>
          {counter && <span className="shrink-0">{counter}</span>}
        </div>
      )}
    </div>
  );
}

function IconInput({
  icon: Icon, align = "center", children,
}: { icon: typeof User; align?: "center" | "top"; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className={`pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground ${align === "top" ? "top-3" : "top-1/2 -translate-y-1/2"}`} />
      {children}
    </div>
  );
}

