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
      sendFn({ data: { kind: "text", conversation_id: conversationId, body: text.trim() } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["atd", "messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
      // Dispara worker best-effort
      fetch("/api/public/whatsapp/service-tick", { method: "POST" }).catch(() => {});
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar"),
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
          <MessageBubble key={m.id} msg={m} />
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

function MessageBubble({ msg }: { msg: any }) {
  const out = msg.direction === "outbound";
  const bubble = out
    ? "ml-auto bg-emerald-600 text-white"
    : "mr-auto bg-white dark:bg-neutral-800 text-foreground";
  return (
    <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${bubble}`}>
      {msg.template_name && (
        <div className={`mb-1 text-[10px] font-medium ${out ? "text-emerald-100" : "text-muted-foreground"}`}>
          Template · {msg.template_name}
        </div>
      )}
      {msg.body && <div className="whitespace-pre-wrap break-words text-sm">{msg.body}</div>}
      {msg.message_type && msg.message_type !== "text" && !msg.body && (
        <div className="text-xs italic opacity-80">[{msg.message_type}]</div>
      )}
      <div className={`mt-1 flex items-center gap-1 text-[10px] ${out ? "text-emerald-100/90" : "text-muted-foreground"}`}>
        <span>{formatTime(msg.created_at)}</span>
        {out && <StatusTick status={msg.status} />}
        {msg.error_message && <span className="text-red-200">· {msg.error_message}</span>}
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
