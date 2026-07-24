import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversationsAtd,
  getConversation,
  listConversationMessages,
  sendConversationMessage,
  markConversationRead,
  setConversationStatus,
  listConversationNotes,
  addConversationNote,
  listApprovedTemplates,
} from "@/lib/wa-conversations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { AttendanceSettingsDialog } from "@/components/admin/attendance-settings-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Search,
  Send,
  Clock,
  CheckCheck,
  Check,
  X,
  MessageSquare,
  User,
  StickyNote,
  FileText,
  Paperclip,
  Image as ImageIcon,
  Video,
  Music,
  File as FileIcon,
  ListChecks,
  MousePointerClick,
  Reply,
  Plus,
  Trash2,
  CornerUpLeft,
  Link2,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin/atendimento")({
  head: () => ({
    meta: [
      { title: "Atendimento WhatsApp | Disparos FR" },
      { name: "description", content: "Central de atendimento WhatsApp Cloud API." },
    ],
  }),
  component: AtendimentoPage,
});

type ConversationRow = {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  connection_id: string | null;
  phone_number_id: string | null;
  campaign_id: string | null;
  assigned_user_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  conversation_status: string;
  service_window_status: string;
  service_window_expires_at: string | null;
};

function AtendimentoPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversationsAtd);
  const getFn = useServerFn(getConversation);
  const msgsFn = useServerFn(listConversationMessages);
  const sendFn = useServerFn(sendConversationMessage);
  const markReadFn = useServerFn(markConversationRead);
  const setStatusFn = useServerFn(setConversationStatus);
  const notesListFn = useServerFn(listConversationNotes);
  const noteAddFn = useServerFn(addConversationNote);
  const tplListFn = useServerFn(listApprovedTemplates);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "waiting" | "in_progress" | "resolved" | "archived">("all");
  const [windowFilter, setWindowFilter] = useState<"all" | "open" | "closed">("all");
  const [assignedFilter, setAssignedFilter] = useState<"all" | "me" | "none">("all");
  const [search, setSearch] = useState("");

  // Lista de conversas (SWR + realtime)
  const convsQuery = useQuery({
    queryKey: ["atd", "conversations", { statusFilter, windowFilter, assignedFilter, search }],
    queryFn: () =>
      listFn({
        data: {
          status: statusFilter,
          window: windowFilter,
          assigned: assignedFilter,
          search,
        },
      }) as Promise<ConversationRow[]>,
    refetchInterval: 15000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("atd-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wa_conversation_messages" },
        (payload) => {
          const convId = (payload.new as any)?.conversation_id;
          if (convId) qc.invalidateQueries({ queryKey: ["atd", "messages", convId] });
          qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const convs = convsQuery.data ?? [];

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Atendimento WhatsApp
        </h1>
        <Badge variant="secondary" className="ml-2">
          {convs.length} conversas
        </Badge>
        <div className="ml-auto">
          <AttendanceSettingsDialog />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden md:grid-cols-[320px_1fr_320px]">
        {/* Coluna 1 — filtros + lista */}
        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="space-y-2 border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-9"
              />
            </div>
            <div className="grid grid-cols-3 gap-1">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Abertas</SelectItem>
                  <SelectItem value="waiting">Aguardando</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="resolved">Resolvidas</SelectItem>
                  <SelectItem value="archived">Arquivadas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={windowFilter} onValueChange={(v) => setWindowFilter(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Janela: todas</SelectItem>
                  <SelectItem value="open">24h aberta</SelectItem>
                  <SelectItem value="closed">24h fechada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os agentes</SelectItem>
                  <SelectItem value="me">Minhas</SelectItem>
                  <SelectItem value="none">Sem responsável</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {convsQuery.isLoading ? (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : convs.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma conversa ainda.
              </div>
            ) : (
              <ul className="divide-y">
                {convs.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setSelectedId(c.id);
                        markReadFn({ data: { conversation_id: c.id } })
                          .then(() => qc.invalidateQueries({ queryKey: ["atd", "conversations"] }))
                          .catch(() => {});
                      }}
                      className={`flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-accent ${
                        selectedId === c.id ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.contact_name || formatPhone(c.contact_phone)}
                        </span>
                        {c.unread_count > 0 && (
                          <Badge className="h-5 shrink-0 rounded-full px-1.5 text-[10px]">
                            {c.unread_count}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{c.last_message_preview || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        <WindowBadge conv={c} />
                        <StatusBadge status={c.conversation_status} />
                        <span className="ml-auto text-muted-foreground">{formatRelative(c.last_message_at)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        {/* Coluna 2 — chat */}
        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          {selectedId ? (
            <ChatPanel
              conversationId={selectedId}
              getFn={getFn}
              msgsFn={msgsFn}
              sendFn={sendFn}
              setStatusFn={setStatusFn}
              tplListFn={tplListFn}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Selecione uma conversa
            </div>
          )}
        </div>

        {/* Coluna 3 — contexto */}
        <div className="hidden min-h-0 md:flex md:flex-col rounded-lg border bg-card">
          {selectedId ? (
            <ContextPanel
              conversationId={selectedId}
              getFn={getFn}
              notesListFn={notesListFn}
              noteAddFn={noteAddFn}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Nenhuma seleção
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatPanel(props: {
  conversationId: string;
  getFn: any;
  msgsFn: any;
  sendFn: any;
  setStatusFn: any;
  tplListFn: any;
}) {
  const qc = useQueryClient();
  const { conversationId, getFn, msgsFn, sendFn, setStatusFn, tplListFn } = props;
  const [text, setText] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [tplId, setTplId] = useState<string>("");
  const [replyTo, setReplyTo] = useState<{ wamid: string; preview: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachTab, setAttachTab] = useState<"media" | "buttons" | "list">("media");
  const [mediaType, setMediaType] = useState<"image" | "video" | "audio" | "document">("image");
  const [mediaLink, setMediaLink] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaFilename, setMediaFilename] = useState("");
  const [btnBody, setBtnBody] = useState("");
  const [btnHeader, setBtnHeader] = useState("");
  const [btnFooter, setBtnFooter] = useState("");
  const [buttons, setButtons] = useState<Array<{ id: string; title: string }>>([
    { id: "opt_1", title: "" },
  ]);
  const [listBody, setListBody] = useState("");
  const [listHeader, setListHeader] = useState("");
  const [listFooter, setListFooter] = useState("");
  const [listButton, setListButton] = useState("Ver opções");
  const [listRows, setListRows] = useState<Array<{ id: string; title: string; description: string }>>([
    { id: "row_1", title: "", description: "" },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);


  const convQuery = useQuery({
    queryKey: ["atd", "conv", conversationId],
    queryFn: () => getFn({ data: { id: conversationId } }),
  });
  const msgsQuery = useQuery({
    queryKey: ["atd", "messages", conversationId],
    queryFn: () => msgsFn({ data: { conversation_id: conversationId } }),
    refetchInterval: 5000,
  });
  const tplQuery = useQuery({
    queryKey: ["atd", "templates", (convQuery.data as any)?.conversation?.connection_id],
    enabled: tplOpen,
    queryFn: () =>
      tplListFn({
        data: { connection_id: (convQuery.data as any)?.conversation?.connection_id ?? undefined },
      }),
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgsQuery.data]);

  const sendText = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          kind: "text",
          conversation_id: conversationId,
          body: text.trim(),
          context_wamid: replyTo?.wamid ?? null,
        },
      }),
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["atd", "messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
      // Dispara worker best-effort
      fetch("/api/public/whatsapp/service-tick", { method: "POST" }).catch(() => {});
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar"),
  });

  const bumpWorker = () => {
    fetch("/api/public/whatsapp/service-tick", { method: "POST" }).catch(() => {});
  };
  const invalidateAfterSend = () => {
    qc.invalidateQueries({ queryKey: ["atd", "messages", conversationId] });
    qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
    bumpWorker();
  };

  const sendMedia = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          kind: "media",
          conversation_id: conversationId,
          media_type: mediaType,
          link: mediaLink.trim(),
          caption: mediaCaption.trim() || undefined,
          filename: mediaType === "document" && mediaFilename.trim() ? mediaFilename.trim() : undefined,
          context_wamid: replyTo?.wamid ?? null,
        },
      }),
    onSuccess: () => {
      setMediaLink("");
      setMediaCaption("");
      setMediaFilename("");
      setAttachOpen(false);
      setReplyTo(null);
      invalidateAfterSend();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar mídia"),
  });

  const sendButtons = useMutation({
    mutationFn: () => {
      const cleaned = buttons
        .map((b, i) => ({
          id: (b.id || `opt_${i + 1}`).trim(),
          title: b.title.trim(),
        }))
        .filter((b) => b.title.length > 0);
      if (cleaned.length === 0) throw new Error("Adicione ao menos 1 botão");
      return sendFn({
        data: {
          kind: "interactive_buttons",
          conversation_id: conversationId,
          body: btnBody.trim(),
          header: btnHeader.trim() || undefined,
          footer: btnFooter.trim() || undefined,
          buttons: cleaned,
          context_wamid: replyTo?.wamid ?? null,
        },
      });
    },
    onSuccess: () => {
      setBtnBody("");
      setBtnHeader("");
      setBtnFooter("");
      setButtons([{ id: "opt_1", title: "" }]);
      setAttachOpen(false);
      setReplyTo(null);
      invalidateAfterSend();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar botões"),
  });

  const sendList = useMutation({
    mutationFn: () => {
      const cleanedRows = listRows
        .map((r, i) => ({
          id: (r.id || `row_${i + 1}`).trim(),
          title: r.title.trim(),
          description: r.description.trim() || undefined,
        }))
        .filter((r) => r.title.length > 0);
      if (cleanedRows.length === 0) throw new Error("Adicione ao menos 1 item");
      return sendFn({
        data: {
          kind: "interactive_list",
          conversation_id: conversationId,
          body: listBody.trim(),
          header: listHeader.trim() || undefined,
          footer: listFooter.trim() || undefined,
          button: (listButton.trim() || "Ver opções").slice(0, 20),
          sections: [{ title: undefined, rows: cleanedRows }],
          context_wamid: replyTo?.wamid ?? null,
        },
      });
    },
    onSuccess: () => {
      setListBody("");
      setListHeader("");
      setListFooter("");
      setListRows([{ id: "row_1", title: "", description: "" }]);
      setAttachOpen(false);
      setReplyTo(null);
      invalidateAfterSend();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar lista"),
  });


  const sendTpl = useMutation({
    mutationFn: () =>
      sendFn({
        data: { kind: "template", conversation_id: conversationId, template_id: tplId },
      }),
    onSuccess: () => {
      setTplOpen(false);
      setTplId("");
      qc.invalidateQueries({ queryKey: ["atd", "messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
      fetch("/api/public/whatsapp/service-tick", { method: "POST" }).catch(() => {});
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar template"),
  });

  const conv = (convQuery.data as any)?.conversation;
  const connection = (convQuery.data as any)?.connection;
  const windowOpen = useMemo(() => {
    if (!conv) return false;
    if (conv.service_window_status !== "open") return false;
    if (!conv.service_window_expires_at) return true;
    return new Date(conv.service_window_expires_at).getTime() > Date.now();
  }, [conv]);
  const remaining = useMemo(() => {
    if (!conv?.service_window_expires_at) return null;
    const ms = new Date(conv.service_window_expires_at).getTime() - Date.now();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [conv]);

  if (convQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {conv?.contact_name || formatPhone(conv?.contact_phone)}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatPhone(conv?.contact_phone)}</span>
            {connection?.phone_number && (
              <>
                <span>•</span>
                <span>via {connection.phone_number}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {windowOpen ? (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" /> 24h aberta {remaining ? `• ${remaining}` : ""}
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <Clock className="h-3 w-3" /> Janela fechada
            </Badge>
          )}
          <Select
            value={conv?.conversation_status ?? "open"}
            onValueChange={async (v) => {
              try {
                await setStatusFn({ data: { conversation_id: conversationId, status: v as any } });
                qc.invalidateQueries({ queryKey: ["atd", "conv", conversationId] });
                qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
              } catch (e: any) {
                toast.error(e?.message ?? "Falha");
              }
            }}
          >
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Aberta</SelectItem>
              <SelectItem value="waiting">Aguardando</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="resolved">Resolvida</SelectItem>
              <SelectItem value="archived">Arquivada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 bg-muted/30 p-3">
        {(msgsQuery.data as any[] | undefined)?.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            onReply={(mm) => {
              const preview =
                mm.body ??
                (mm.message_type ? `[${mm.message_type}]` : "Mensagem");
              const wamid = mm.wamid || null;
              if (!wamid) {
                toast.error("Sem identificador da mensagem para citar.");
                return;
              }
              setReplyTo({ wamid, preview: String(preview).slice(0, 120) });
            }}
          />
        )) ?? null}
        {msgsQuery.isLoading && (
          <div className="flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        {!windowOpen && !tplOpen && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Janela de 24h fechada. Envie um <button className="underline" onClick={() => setTplOpen(true)}>template aprovado</button> para reabrir a conversa.
          </div>
        )}

        {replyTo && (
          <div className="flex items-start gap-2 rounded-md border-l-4 border-emerald-500 bg-muted/60 px-2 py-1 text-xs">
            <CornerUpLeft className="mt-0.5 h-3 w-3 text-emerald-600" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Respondendo</div>
              <div className="truncate">{replyTo.preview}</div>
            </div>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setReplyTo(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {tplOpen ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Enviar template</span>
              <Button size="sm" variant="ghost" onClick={() => setTplOpen(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <Select value={tplId} onValueChange={setTplId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um template aprovado" /></SelectTrigger>
              <SelectContent>
                {(tplQuery.data as any[] | undefined)?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="opacity-60">({t.language})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => sendTpl.mutate()}
              disabled={!tplId || sendTpl.isPending}
              className="w-full"
              size="sm"
            >
              {sendTpl.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Enviar template
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Popover open={attachOpen} onOpenChange={setAttachOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!windowOpen}
                  title="Anexar mídia, botões ou lista"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-[380px] p-3">
                <Tabs value={attachTab} onValueChange={(v) => setAttachTab(v as any)}>
                  <TabsList className="grid grid-cols-3">
                    <TabsTrigger value="media" className="text-xs">
                      <ImageIcon className="mr-1 h-3 w-3" /> Mídia
                    </TabsTrigger>
                    <TabsTrigger value="buttons" className="text-xs">
                      <MousePointerClick className="mr-1 h-3 w-3" /> Botões
                    </TabsTrigger>
                    <TabsTrigger value="list" className="text-xs">
                      <ListChecks className="mr-1 h-3 w-3" /> Lista
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="media" className="space-y-2 pt-3">
                    <div className="grid grid-cols-4 gap-1">
                      {(["image", "video", "audio", "document"] as const).map((t) => (
                        <Button
                          key={t}
                          size="sm"
                          variant={mediaType === t ? "default" : "outline"}
                          className="h-8 text-xs"
                          onClick={() => setMediaType(t)}
                        >
                          {t === "image" && <ImageIcon className="mr-1 h-3 w-3" />}
                          {t === "video" && <Video className="mr-1 h-3 w-3" />}
                          {t === "audio" && <Music className="mr-1 h-3 w-3" />}
                          {t === "document" && <FileIcon className="mr-1 h-3 w-3" />}
                          {t === "image" ? "Imagem" : t === "video" ? "Vídeo" : t === "audio" ? "Áudio" : "Doc"}
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL pública (https)</Label>
                      <Input
                        value={mediaLink}
                        onChange={(e) => setMediaLink(e.target.value)}
                        placeholder="https://…"
                        className="h-8 text-xs"
                      />
                    </div>
                    {(mediaType === "image" || mediaType === "video" || mediaType === "document") && (
                      <div className="space-y-1">
                        <Label className="text-xs">Legenda (opcional)</Label>
                        <Textarea
                          value={mediaCaption}
                          onChange={(e) => setMediaCaption(e.target.value)}
                          rows={2}
                          className="resize-none text-xs"
                          maxLength={1024}
                        />
                      </div>
                    )}
                    {mediaType === "document" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Nome do arquivo (opcional)</Label>
                        <Input
                          value={mediaFilename}
                          onChange={(e) => setMediaFilename(e.target.value)}
                          placeholder="documento.pdf"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!mediaLink.trim() || sendMedia.isPending}
                      onClick={() => sendMedia.mutate()}
                    >
                      {sendMedia.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3 w-3" /> Enviar mídia</>}
                    </Button>
                  </TabsContent>

                  <TabsContent value="buttons" className="space-y-2 pt-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Cabeçalho (opcional, até 60)</Label>
                      <Input value={btnHeader} onChange={(e) => setBtnHeader(e.target.value)} maxLength={60} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Corpo (obrigatório)</Label>
                      <Textarea value={btnBody} onChange={(e) => setBtnBody(e.target.value)} rows={2} className="resize-none text-xs" maxLength={1024} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rodapé (opcional)</Label>
                      <Input value={btnFooter} onChange={(e) => setBtnFooter(e.target.value)} maxLength={60} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Botões (máx 3, título até 20)</Label>
                      {buttons.map((b, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <Input
                            value={b.title}
                            onChange={(e) => {
                              const arr = [...buttons];
                              arr[i] = { ...arr[i], title: e.target.value };
                              setButtons(arr);
                            }}
                            placeholder={`Botão ${i + 1}`}
                            maxLength={20}
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setButtons(buttons.filter((_, j) => j !== i))}
                            disabled={buttons.length <= 1}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {buttons.length < 3 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-full text-xs"
                          onClick={() =>
                            setButtons([...buttons, { id: `opt_${buttons.length + 1}`, title: "" }])
                          }
                        >
                          <Plus className="mr-1 h-3 w-3" /> Adicionar botão
                        </Button>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!btnBody.trim() || buttons.every((b) => !b.title.trim()) || sendButtons.isPending}
                      onClick={() => sendButtons.mutate()}
                    >
                      {sendButtons.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3 w-3" /> Enviar botões</>}
                    </Button>
                  </TabsContent>

                  <TabsContent value="list" className="space-y-2 pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Cabeçalho</Label>
                        <Input value={listHeader} onChange={(e) => setListHeader(e.target.value)} maxLength={60} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Texto do botão</Label>
                        <Input value={listButton} onChange={(e) => setListButton(e.target.value)} maxLength={20} className="h-8 text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Corpo</Label>
                      <Textarea value={listBody} onChange={(e) => setListBody(e.target.value)} rows={2} className="resize-none text-xs" maxLength={1024} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rodapé</Label>
                      <Input value={listFooter} onChange={(e) => setListFooter(e.target.value)} maxLength={60} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Itens (máx 10, título até 24)</Label>
                      {listRows.map((r, i) => (
                        <div key={i} className="space-y-1 rounded border p-1.5">
                          <div className="flex items-center gap-1">
                            <Input
                              value={r.title}
                              onChange={(e) => {
                                const arr = [...listRows];
                                arr[i] = { ...arr[i], title: e.target.value };
                                setListRows(arr);
                              }}
                              placeholder={`Item ${i + 1}`}
                              maxLength={24}
                              className="h-7 text-xs"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setListRows(listRows.filter((_, j) => j !== i))}
                              disabled={listRows.length <= 1}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <Input
                            value={r.description}
                            onChange={(e) => {
                              const arr = [...listRows];
                              arr[i] = { ...arr[i], description: e.target.value };
                              setListRows(arr);
                            }}
                            placeholder="Descrição (opcional)"
                            maxLength={72}
                            className="h-7 text-xs"
                          />
                        </div>
                      ))}
                      {listRows.length < 10 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-full text-xs"
                          onClick={() =>
                            setListRows([...listRows, { id: `row_${listRows.length + 1}`, title: "", description: "" }])
                          }
                        >
                          <Plus className="mr-1 h-3 w-3" /> Adicionar item
                        </Button>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!listBody.trim() || listRows.every((r) => !r.title.trim()) || sendList.isPending}
                      onClick={() => sendList.mutate()}
                    >
                      {sendList.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3 w-3" /> Enviar lista</>}
                    </Button>
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={windowOpen ? "Escreva uma mensagem…" : "Janela fechada — envie um template"}
              disabled={!windowOpen || sendText.isPending}
              rows={2}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (windowOpen && text.trim()) sendText.mutate();
                }
              }}
            />
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTplOpen(true)}
                title="Enviar template"
              >
                <FileText className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                disabled={!windowOpen || !text.trim() || sendText.isPending}
                onClick={() => sendText.mutate()}
              >
                {sendText.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

    </>
  );
}

function MessageBubble({ msg, onReply }: { msg: any; onReply?: (m: any) => void }) {
  const out = msg.direction === "outbound";
  const bubble = out
    ? "ml-auto bg-emerald-600 text-white"
    : "mr-auto bg-white dark:bg-neutral-800 text-foreground";
  const payload = msg.payload ?? {};
  const isMedia =
    msg.message_type === "image" ||
    msg.message_type === "video" ||
    msg.message_type === "audio" ||
    msg.message_type === "document" ||
    msg.message_type === "sticker";
  const isInteractive = msg.message_type === "interactive";
  const buttons: Array<{ id: string; title: string }> = isInteractive && payload?.kind === "interactive_buttons" ? (payload.buttons ?? []) : [];
  const listSections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }> =
    isInteractive && payload?.kind === "interactive_list" ? (payload.sections ?? []) : [];
  const header = isInteractive ? payload?.header : null;
  const footer = isInteractive ? payload?.footer : null;

  return (
    <div className={`group max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${bubble}`}>
      {msg.template_name && (
        <div className={`mb-1 text-[10px] font-medium ${out ? "text-emerald-100" : "text-muted-foreground"}`}>
          Template · {msg.template_name}
        </div>
      )}

      {header && <div className="mb-1 text-xs font-semibold opacity-90">{String(header)}</div>}

      {isMedia && msg.media_url && (msg.message_type === "image") && (
        <a href={msg.media_url} target="_blank" rel="noreferrer">
          <img
            src={msg.media_url}
            alt={msg.media_caption ?? "imagem"}
            className="mb-1 max-h-56 rounded object-cover"
            loading="lazy"
          />
        </a>
      )}
      {isMedia && msg.media_url && msg.message_type === "video" && (
        <video src={msg.media_url} controls className="mb-1 max-h-56 rounded" />
      )}
      {isMedia && msg.media_url && msg.message_type === "audio" && (
        <audio src={msg.media_url} controls className="mb-1 w-full" />
      )}
      {isMedia && msg.media_url && msg.message_type === "document" && (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noreferrer"
          className={`mb-1 flex items-center gap-2 rounded border px-2 py-1 text-xs ${out ? "border-emerald-400/40 bg-emerald-700/40" : "border-border bg-muted/50"}`}
        >
          <FileIcon className="h-4 w-4" />
          <span className="truncate">{msg.media_filename ?? "Documento"}</span>
        </a>
      )}
      {isMedia && !msg.media_url && (
        <div className="text-xs italic opacity-80">[{msg.message_type}]</div>
      )}

      {msg.body && <div className="whitespace-pre-wrap break-words text-sm">{msg.body}</div>}

      {buttons.length > 0 && (
        <div className={`mt-2 space-y-1 border-t pt-2 ${out ? "border-emerald-400/40" : "border-border/60"}`}>
          {buttons.map((b) => (
            <div
              key={b.id}
              className={`rounded px-2 py-1 text-center text-xs ${out ? "bg-emerald-700/40" : "bg-muted"}`}
            >
              {b.title}
            </div>
          ))}
        </div>
      )}
      {listSections.length > 0 && (
        <div className={`mt-2 space-y-1 border-t pt-2 ${out ? "border-emerald-400/40" : "border-border/60"}`}>
          {listSections.flatMap((s) => s.rows).map((r) => (
            <div key={r.id} className={`rounded px-2 py-1 text-xs ${out ? "bg-emerald-700/40" : "bg-muted"}`}>
              <div className="font-medium">{r.title}</div>
              {r.description && <div className="opacity-80">{r.description}</div>}
            </div>
          ))}
        </div>
      )}

      {footer && <div className="mt-1 text-[10px] opacity-70">{String(footer)}</div>}

      {msg.interactive_button_title && !out && (
        <div className="mt-1 text-[10px] opacity-70">Selecionado: {msg.interactive_button_title}</div>
      )}
      {msg.interactive_list_title && !out && (
        <div className="mt-1 text-[10px] opacity-70">Selecionado: {msg.interactive_list_title}</div>
      )}

      <div className={`mt-1 flex items-center gap-1 text-[10px] ${out ? "text-emerald-100/90" : "text-muted-foreground"}`}>
        <span>{formatTime(msg.created_at)}</span>
        {out && <StatusTick status={msg.status} />}
        {msg.error_message && <span className="text-red-200">· {msg.error_message}</span>}
        {onReply && (
          <button
            className={`ml-auto opacity-0 transition group-hover:opacity-100 ${out ? "text-emerald-100" : "text-muted-foreground"}`}
            onClick={() => onReply(msg)}
            title="Responder"
          >
            <Reply className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}


function StatusTick({ status }: { status: string }) {
  if (status === "queued") return <Clock className="h-3 w-3" />;
  if (status === "sent") return <Check className="h-3 w-3" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-sky-300" />;
  if (status === "failed") return <X className="h-3 w-3 text-red-300" />;
  return null;
}

function ContextPanel(props: { conversationId: string; getFn: any; notesListFn: any; noteAddFn: any }) {
  const qc = useQueryClient();
  const { conversationId, getFn, notesListFn, noteAddFn } = props;
  const [note, setNote] = useState("");
  const convQuery = useQuery({
    queryKey: ["atd", "conv", conversationId],
    queryFn: () => getFn({ data: { id: conversationId } }),
  });
  const notesQuery = useQuery({
    queryKey: ["atd", "notes", conversationId],
    queryFn: () => notesListFn({ data: { conversation_id: conversationId } }),
  });
  const conv = (convQuery.data as any)?.conversation;
  const campaign = (convQuery.data as any)?.campaign;
  const connection = (convQuery.data as any)?.connection;

  return (
    <Tabs defaultValue="contact" className="flex flex-1 flex-col">
      <TabsList className="m-2 grid grid-cols-2">
        <TabsTrigger value="contact"><User className="mr-1 h-3 w-3" /> Contato</TabsTrigger>
        <TabsTrigger value="notes"><StickyNote className="mr-1 h-3 w-3" /> Notas</TabsTrigger>
      </TabsList>
      <TabsContent value="contact" className="flex-1 overflow-y-auto space-y-3 p-3">
        <div>
          <div className="text-xs text-muted-foreground">Nome</div>
          <div className="text-sm">{conv?.contact_name || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Telefone</div>
          <div className="text-sm">{formatPhone(conv?.contact_phone)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Número de origem</div>
          <div className="text-sm">{connection?.phone_number ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Campanha</div>
          <div className="text-sm">{campaign?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Janela 24h</div>
          <div className="text-sm">
            {conv?.service_window_expires_at
              ? new Date(conv.service_window_expires_at).toLocaleString("pt-BR")
              : "—"}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="notes" className="flex-1 overflow-y-auto space-y-2 p-3">
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota interna (não é enviada ao cliente)"
            rows={2}
          />
          <Button
            size="sm"
            disabled={!note.trim()}
            onClick={async () => {
              try {
                await noteAddFn({ data: { conversation_id: conversationId, body: note.trim() } });
                setNote("");
                qc.invalidateQueries({ queryKey: ["atd", "notes", conversationId] });
              } catch (e: any) {
                toast.error(e?.message ?? "Falha");
              }
            }}
          >
            Adicionar nota
          </Button>
        </div>
        <div className="space-y-2 pt-2">
          {(notesQuery.data as any[] | undefined)?.map((n) => (
            <div key={n.id} className="rounded-md border bg-muted/40 p-2 text-xs">
              <div className="whitespace-pre-wrap">{n.body}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {new Date(n.created_at).toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function WindowBadge({ conv }: { conv: ConversationRow }) {
  const open =
    conv.service_window_status === "open" &&
    (!conv.service_window_expires_at ||
      new Date(conv.service_window_expires_at).getTime() > Date.now());
  return (
    <Badge variant={open ? "secondary" : "outline"} className="h-4 rounded px-1 text-[9px]">
      {open ? "24h" : "fechada"}
    </Badge>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "Aberta",
    waiting: "Aguardando",
    in_progress: "Em andamento",
    resolved: "Resolvida",
    archived: "Arquivada",
  };
  return (
    <Badge variant="outline" className="h-4 rounded px-1 text-[9px]">
      {map[status] ?? status}
    </Badge>
  );
}

function formatPhone(p?: string | null) {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return "+" + d;
}
function formatTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatRelative(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
