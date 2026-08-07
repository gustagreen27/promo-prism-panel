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
  listAttendanceNumbers,
} from "@/lib/wa-conversations.functions";
import type { AttendanceNumber } from "@/lib/wa-conversations.functions";
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
  Smartphone,
  Bell,
  MoreVertical,
  SlidersHorizontal,
  Phone,
  Hash,
  Megaphone,
  MessageCircle,
  Lock,
  Smile,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronDown,
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
  const numbersFn = useServerFn(listAttendanceNumbers);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "waiting" | "in_progress" | "resolved" | "archived">("all");
  const [windowFilter, setWindowFilter] = useState<"all" | "open" | "closed">("all");
  const [assignedFilter, setAssignedFilter] = useState<"all" | "me" | "none">("all");
  const [search, setSearch] = useState("");
  const [quickTab, setQuickTab] = useState<"all" | "open" | "pending">("all");
  const [contextOpen, setContextOpen] = useState(true);

  // Todos os números conectados (coluna 1), com ou sem conversas
  const numbersQuery = useQuery({
    queryKey: ["atd", "numbers"],
    queryFn: () => numbersFn() as Promise<AttendanceNumber[]>,
    refetchInterval: 20000,
  });
  const numbers = numbersQuery.data ?? [];
  const totalUnread = numbers.reduce((a, n) => a + n.unread, 0);


  const [live, setLive] = useState(false);

  // Lista de conversas (SWR + realtime)
  const convsQuery = useQuery({
    queryKey: ["atd", "conversations", { selectedNumber, statusFilter, windowFilter, assignedFilter, search }],
    queryFn: () =>
      listFn({
        data: {
          status: statusFilter,
          window: windowFilter,
          assigned: assignedFilter,
          search,
          ...(selectedNumber ? { phone_number_id: selectedNumber } : {}),
        },
      }) as Promise<ConversationRow[]>,
    enabled: !!selectedNumber || numbersQuery.isFetched,
    placeholderData: (prev) => prev,
    refetchInterval: live ? 30000 : 5000,
  });


  useEffect(() => {
    const bumpLists = () => {
      qc.invalidateQueries({ queryKey: ["atd", "conversations"] });
      qc.invalidateQueries({ queryKey: ["atd", "numbers"] });
    };
    const ch = supabase
      .channel("atd-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversations" },
        bumpLists,
      )
      .on(
        // INSERT (nova mensagem) e UPDATE (status de envio/entrega/erro)
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversation_messages" },
        (payload) => {
          const convId = (payload.new as any)?.conversation_id ?? (payload.old as any)?.conversation_id;
          if (convId) qc.invalidateQueries({ queryKey: ["atd", "messages", convId] });
          bumpLists();
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => {
      setLive(false);
      supabase.removeChannel(ch);
    };
  }, [qc]);


  const convs = convsQuery.data ?? [];

  const activeNumber = numbers.find((n) => n.phone_number_id === selectedNumber) ?? null;
  const activeFilters =
    (statusFilter !== "all" ? 1 : 0) + (windowFilter !== "all" ? 1 : 0) + (assignedFilter !== "all" ? 1 : 0);

  const isWindowOpen = (c: ConversationRow) =>
    c.service_window_status === "open" &&
    (!c.service_window_expires_at || new Date(c.service_window_expires_at).getTime() > Date.now());
  const countAll = convs.length;
  const countOpen = convs.filter(isWindowOpen).length;
  const countPending = convs.filter((c) => c.unread_count > 0).length;
  const visibleConvs =
    quickTab === "open" ? convs.filter(isWindowOpen)
    : quickTab === "pending" ? convs.filter((c) => c.unread_count > 0)
    : convs;

  return (
    <div className="h-[calc(100vh-72px)] p-2 md:p-3">
      <div className="flex h-full overflow-hidden rounded-3xl border bg-card shadow-elegant-lg">
        {/* Rail de ícones */}
        <nav className="hidden w-[68px] shrink-0 flex-col items-center gap-1 border-r bg-muted/30 py-4 lg:flex">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
            <MessageCircle className="h-5 w-5" />
          </span>
          {[
            { icon: MessageSquare, label: "Conversas", active: true },
            { icon: Users, label: "Contatos" },
            { icon: BarChart3, label: "Relatórios" },
            { icon: Settings, label: "Configurações" },
          ].map((it) => (
            <button
              key={it.label}
              title={it.label}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200 ${
                it.active
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <it.icon className="h-[18px] w-[18px]" />
            </button>
          ))}
          <div className="flex-1" />
          <button className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition hover:bg-accent hover:text-foreground" title="Notificações">
            <Bell className="h-[18px] w-[18px]" />
          </button>
          <button className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition hover:bg-accent hover:text-foreground" title="Ajuda">
            <HelpCircle className="h-[18px] w-[18px]" />
          </button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barra superior */}
          <header className="flex items-center gap-3 border-b px-4 py-3 md:px-5">
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">Atendimento WhatsApp</h1>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {countAll} {countAll === 1 ? "conversa" : "conversas"}
            </span>
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:inline-flex ${
                live
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "border-border bg-muted text-muted-foreground"
              }`}
              title={live ? "Atualizações em tempo real ativas" : "Reconectando… usando atualização periódica"}
            >
              <span className="relative flex h-2 w-2">
                {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
              </span>
              {live ? "Ao vivo" : "Reconectando"}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <AttendanceSettingsDialog />
              <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground" title="Notificações">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground" title="Mais">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div
            className={`grid min-h-0 flex-1 ${
              contextOpen && selectedId
                ? "grid-cols-1 md:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr_320px]"
                : "grid-cols-1 md:grid-cols-[320px_1fr]"
            }`}
          >
            {/* Coluna 1 — conversas */}
            <div className={`flex min-h-0 flex-col border-r bg-background/40 ${selectedId ? "hidden md:flex" : "flex"}`}>
              <div className="space-y-3 p-3">
                {/* Seletor de conexão */}
                <Select
                  value={selectedNumber ?? "__all"}
                  onValueChange={(v) => {
                    setSelectedNumber(v === "__all" ? null : v);
                    setSelectedId(null);
                  }}
                >
                  <SelectTrigger className="h-11 w-full rounded-2xl border-muted bg-muted/40 text-sm font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="__all">
                      Todos os números{totalUnread > 0 ? ` · ${totalUnread}` : ""}
                    </SelectItem>
                    {numbers.map((n) => (
                      <SelectItem key={n.phone_number_id} value={n.phone_number_id}>
                        {(n.nome_interno || formatPhone(n.display_phone_number ?? n.phone_number_id)) +
                          (n.unread > 0 ? ` · ${n.unread}` : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou telefone"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-11 rounded-2xl border-muted bg-background pl-10"
                    />
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="relative h-11 w-11 shrink-0 rounded-2xl">
                        <SlidersHorizontal className="h-4 w-4" />
                        {activeFilters > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] text-white">
                            {activeFilters}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 space-y-3 rounded-2xl">
                      <div className="space-y-1">
                        <Label className="text-xs">Status</Label>
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
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Janela de 24h</Label>
                        <Select value={windowFilter} onValueChange={(v) => setWindowFilter(v as any)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            <SelectItem value="open">Aberta</SelectItem>
                            <SelectItem value="closed">Fechada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Responsável</Label>
                        <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v as any)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os agentes</SelectItem>
                            <SelectItem value="me">Minhas</SelectItem>
                            <SelectItem value="none">Sem responsável</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {activeFilters > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => {
                            setStatusFilter("all");
                            setWindowFilter("all");
                            setAssignedFilter("all");
                          }}
                        >
                          Limpar filtros
                        </Button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Chips rápidos */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { id: "all", label: "Todas", count: countAll },
                    { id: "unread", label: "Não lidas", count: countPending },
                    { id: "open", label: "Abertas", count: countOpen },
                    { id: "pending", label: "Pendentes", count: countPending },
                  ] as const).map((t) => {
                    const id = t.id === "unread" ? "pending" : t.id;
                    const active = quickTab === id && (t.id !== "unread" || quickTab === "pending");
                    return (
                      <button
                        key={t.id}
                        onClick={() => setQuickTab(id as any)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                          active
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t.label}
                        {t.count > 0 && (
                          <span
                            className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] ${
                              active ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground"
                            }`}
                          >
                            {t.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <ScrollArea className="flex-1">
                {convsQuery.isLoading ? (
                  <div className="space-y-2 px-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-[86px] animate-pulse rounded-2xl bg-muted/60" />
                    ))}
                  </div>
                ) : visibleConvs.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted">
                      <MessageSquare className="h-5 w-5" />
                    </span>
                    Nenhuma conversa ainda.
                  </div>
                ) : (
                  <ul className="space-y-1.5 px-3 pb-4">
                    {visibleConvs.map((c) => {
                      const active = selectedId === c.id;
                      return (
                        <li key={c.id} className="animate-in fade-in slide-in-from-left-1 duration-200">
                          <button
                            onClick={() => {
                              setSelectedId(c.id);
                              markReadFn({ data: { conversation_id: c.id } })
                                .then(() => qc.invalidateQueries({ queryKey: ["atd", "conversations"] }))
                                .catch(() => {});
                            }}
                            className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-all duration-200 ${
                              active
                                ? "border-emerald-500/40 bg-emerald-500/10 shadow-sm"
                                : "border-border/70 bg-card hover:-translate-y-px hover:border-border hover:shadow-sm"
                            }`}
                          >
                            <ContactAvatar name={c.contact_name} phone={c.contact_phone} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-semibold">
                                  {c.contact_name || formatPhone(c.contact_phone)}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {formatTime(c.last_message_at)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-start justify-between gap-2">
                                <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                                  {c.last_message_preview || "—"}
                                </span>
                                {c.unread_count > 0 && (
                                  <Badge className="mt-0.5 h-5 shrink-0 rounded-full bg-emerald-600 px-1.5 text-[10px] hover:bg-emerald-600">
                                    {c.unread_count}
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-2 flex items-center gap-1.5">
                                <WindowBadge conv={c} />
                                <StatusBadge status={c.conversation_status} />
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                    <li className="pt-2 text-center text-xs text-muted-foreground">
                      {visibleConvs.length} {visibleConvs.length === 1 ? "conversa" : "conversas"}
                    </li>
                  </ul>
                )}
              </ScrollArea>
            </div>

            {/* Coluna 2 — chat */}
            <div className={`flex min-h-0 flex-col overflow-hidden ${selectedId ? "flex" : "hidden md:flex"}`}>
              {selectedId ? (
                <ChatPanel
                  conversationId={selectedId}
                  getFn={getFn}
                  msgsFn={msgsFn}
                  sendFn={sendFn}
                  setStatusFn={setStatusFn}
                  tplListFn={tplListFn}
                  onBack={() => setSelectedId(null)}
                  onToggleContext={() => setContextOpen((v) => !v)}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-wa-chat p-6 text-sm text-muted-foreground">
                  <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-600 shadow-sm">
                    <MessageCircle className="h-8 w-8" />
                  </span>
                  Selecione uma conversa para começar
                </div>
              )}
            </div>

            {/* Coluna 3 — contexto */}
            {contextOpen && selectedId && (
              <div className="hidden min-h-0 border-l xl:flex xl:flex-col">
                <ContextPanel
                  conversationId={selectedId}
                  getFn={getFn}
                  notesListFn={notesListFn}
                  noteAddFn={noteAddFn}
                  onClose={() => setContextOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactAvatar({
  name,
  phone,
  size = "md",
}: {
  name?: string | null;
  phone?: string | null;
  size?: "md" | "lg";
}) {
  const initials = (name?.trim()?.[0] ?? phone?.replace(/\D/g, "").slice(-2, -1) ?? "?").toUpperCase();
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ${
        size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm"
      }`}
    >
      {name ? initials : <User className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />}
    </span>
  );
}


function ChatPanel(props: {
  conversationId: string;
  getFn: any;
  msgsFn: any;
  sendFn: any;
  setStatusFn: any;
  tplListFn: any;
  onBack?: () => void;
  onToggleContext?: () => void;
}) {
  const qc = useQueryClient();
  const { conversationId, getFn, msgsFn, sendFn, setStatusFn, tplListFn, onBack, onToggleContext } = props;
  const [text, setText] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [tplId, setTplId] = useState<string>("");
  const [replyTo, setReplyTo] = useState<{ wamid: string; preview: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachTab, setAttachTab] = useState<"media" | "buttons" | "list" | "cta">("media");
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
  const [ctaBody, setCtaBody] = useState("");
  const [ctaHeader, setCtaHeader] = useState("");
  const [ctaFooter, setCtaFooter] = useState("");
  const [ctaDisplayText, setCtaDisplayText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);


  const convQuery = useQuery({
    queryKey: ["atd", "conv", conversationId],
    queryFn: () => getFn({ data: { id: conversationId } }),
  });
  const msgsQuery = useQuery({
    queryKey: ["atd", "messages", conversationId],
    queryFn: () => msgsFn({ data: { conversation_id: conversationId } }),
    placeholderData: (prev: any) => prev,
    refetchInterval: 4000,
  });
  const tplQuery = useQuery({
    queryKey: ["atd", "templates", (convQuery.data as any)?.conversation?.connection_id],
    enabled: tplOpen,
    queryFn: () =>
      tplListFn({
        data: { connection_id: (convQuery.data as any)?.conversation?.connection_id ?? undefined },
      }),
  });

  // Realtime dedicado da conversa aberta: novas mensagens + mudanças de status
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`atd-conv-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wa_conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["atd", "messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["atd", "conv", conversationId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wa_conversations", filter: `id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["atd", "conv", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  const msgCount = (msgsQuery.data as any[] | undefined)?.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    el.scrollTo({ top: el.scrollHeight, behavior: nearBottom ? "smooth" : "auto" });
  }, [msgCount, conversationId]);


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

  const sendCta = useMutation({
    mutationFn: () => {
      const url = ctaUrl.trim();
      const display = ctaDisplayText.trim();
      if (!url || !display) throw new Error("Informe URL e texto do botão");
      try { new URL(url); } catch { throw new Error("URL inválida"); }
      return sendFn({
        data: {
          kind: "interactive_cta_url",
          conversation_id: conversationId,
          body: ctaBody.trim(),
          header: ctaHeader.trim() || undefined,
          footer: ctaFooter.trim() || undefined,
          display_text: display.slice(0, 20),
          url,
          context_wamid: replyTo?.wamid ?? null,
        },
      });
    },
    onSuccess: () => {
      setCtaBody(""); setCtaHeader(""); setCtaFooter(""); setCtaDisplayText(""); setCtaUrl("");
      setAttachOpen(false); setReplyTo(null); invalidateAfterSend();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar botão CTA"),
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
      <div className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ContactAvatar name={conv?.contact_name} phone={conv?.contact_phone} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {conv?.contact_name || formatPhone(conv?.contact_phone)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">
                {conv?.contact_name ? formatPhone(conv?.contact_phone) : "Clique para adicionar nome"}
              </span>
              {connection?.phone_number && (
                <>
                  <span>•</span>
                  <span className="truncate">via {connection.phone_number}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {windowOpen ? (
            <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 sm:inline-flex dark:text-emerald-300">
              <Clock className="h-3 w-3" /> 24h aberta {remaining ? `• ${remaining}` : ""}
            </span>
          ) : (
            <span className="hidden items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive sm:inline-flex">
              <Clock className="h-3 w-3" /> Janela fechada
            </span>
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
            <SelectTrigger className="h-9 w-36 rounded-xl text-xs"><SelectValue /></SelectTrigger>
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

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto bg-[oklch(0.96_0.015_95)] p-4 dark:bg-[oklch(0.22_0.01_150)]"
      >
        <div className="mx-auto mb-3 flex max-w-md items-center justify-center gap-2 rounded-lg bg-amber-100/80 px-3 py-1.5 text-center text-[11px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          <Lock className="h-3 w-3 shrink-0" />
          As mensagens são protegidas com criptografia de ponta a ponta.
        </div>
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
            Janela de 24h fechada. Envie um <button className="underline" onClick={() => setTplOpen(true)}>template aprovado</button> — a janela só será reaberta quando o contato responder.
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
          <div className="flex items-end gap-2 rounded-3xl border bg-muted/40 p-1.5">
            <Popover open={attachOpen} onOpenChange={setAttachOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 shrink-0 rounded-full text-muted-foreground"
                  disabled={!windowOpen}
                  title="Anexar mídia, botões ou lista"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-[380px] p-3">
                <Tabs value={attachTab} onValueChange={(v) => setAttachTab(v as any)}>
                  <TabsList className="grid grid-cols-4">
                    <TabsTrigger value="media" className="text-xs">
                      <ImageIcon className="mr-1 h-3 w-3" /> Mídia
                    </TabsTrigger>
                    <TabsTrigger value="buttons" className="text-xs">
                      <MousePointerClick className="mr-1 h-3 w-3" /> Botões
                    </TabsTrigger>
                    <TabsTrigger value="list" className="text-xs">
                      <ListChecks className="mr-1 h-3 w-3" /> Lista
                    </TabsTrigger>
                    <TabsTrigger value="cta" className="text-xs">
                      <Link2 className="mr-1 h-3 w-3" /> URL
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

                  <TabsContent value="cta" className="space-y-2 pt-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Header (opcional)</label>
                      <Input value={ctaHeader} onChange={(e) => setCtaHeader(e.target.value)} maxLength={60} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Mensagem</label>
                      <Textarea value={ctaBody} onChange={(e) => setCtaBody(e.target.value)} rows={2} className="resize-none text-xs" maxLength={1024} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Texto do botão</label>
                        <Input value={ctaDisplayText} onChange={(e) => setCtaDisplayText(e.target.value)} maxLength={20} className="h-8 text-xs" placeholder="Abrir" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">URL destino</label>
                        <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} type="url" className="h-8 text-xs" placeholder="https://…" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Footer (opcional)</label>
                      <Input value={ctaFooter} onChange={(e) => setCtaFooter(e.target.value)} maxLength={60} className="h-8 text-xs" />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!ctaBody.trim() || !ctaDisplayText.trim() || !ctaUrl.trim() || sendCta.isPending}
                      onClick={() => sendCta.mutate()}
                    >
                      {sendCta.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3 w-3" /> Enviar botão CTA</>}
                    </Button>
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={windowOpen ? "Digite uma mensagem…" : "Janela fechada — envie um template"}
              disabled={!windowOpen || sendText.isPending}
              rows={1}
              className="max-h-32 min-h-10 resize-none border-0 bg-transparent py-2.5 shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (windowOpen && text.trim()) sendText.mutate();
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 shrink-0 rounded-full text-muted-foreground"
              onClick={() => setTplOpen(true)}
              title="Enviar template"
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
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
        )}
      </div>

    </>
  );
}

function MessageBubble({ msg, onReply }: { msg: any; onReply?: (m: any) => void }) {
  const out = msg.direction === "outbound";
  const bubble = out
    ? "ml-auto bg-[oklch(0.93_0.06_150)] text-foreground dark:bg-emerald-800 dark:text-white rounded-br-md"
    : "mr-auto bg-card text-foreground rounded-bl-md";
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

  const failed = msg.status === "failed";
  const pending = msg.status === "queued" || msg.status === "processing";

  return (
    <div
      className={`group max-w-[75%] rounded-2xl px-3 py-2 shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-1 ${bubble} ${
        failed ? "ring-1 ring-destructive/50" : ""
      } ${pending ? "opacity-80" : "opacity-100"}`}
    >

      {msg.template_name && (
        <div className={`mb-1 text-[10px] font-medium ${out ? "text-foreground/60 dark:text-emerald-100" : "text-muted-foreground"}`}>
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
          className={`mb-1 flex items-center gap-2 rounded border px-2 py-1 text-xs ${out ? "border-emerald-600/30 bg-emerald-600/10" : "border-border bg-muted/50"}`}
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
        <div className={`mt-2 space-y-1 border-t pt-2 ${out ? "border-emerald-600/30" : "border-border/60"}`}>
          {buttons.map((b) => (
            <div
              key={b.id}
              className={`rounded px-2 py-1 text-center text-xs ${out ? "bg-emerald-600/10" : "bg-muted"}`}
            >
              {b.title}
            </div>
          ))}
        </div>
      )}
      {listSections.length > 0 && (
        <div className={`mt-2 space-y-1 border-t pt-2 ${out ? "border-emerald-600/30" : "border-border/60"}`}>
          {listSections.flatMap((s) => s.rows).map((r) => (
            <div key={r.id} className={`rounded px-2 py-1 text-xs ${out ? "bg-emerald-600/10" : "bg-muted"}`}>
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

      {failed && msg.error_message && (
        <div className="mt-1 rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          Falha no envio · {msg.error_message}
        </div>
      )}

      <div className={`mt-1 flex items-center gap-1 text-[10px] ${out ? "text-foreground/60 dark:text-emerald-100/90" : "text-muted-foreground"}`}>
        <span>{formatTime(msg.created_at)}</span>
        {out && <StatusTick status={msg.status} />}
        {!failed && msg.error_message && <span className="text-destructive">· {msg.error_message}</span>}

        {onReply && (
          <button
            className={`ml-auto opacity-0 transition group-hover:opacity-100 ${out ? "text-foreground/60 dark:text-emerald-100" : "text-muted-foreground"}`}
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
  if (status === "queued" || status === "processing")
    return <Clock className="h-3 w-3 animate-pulse" aria-label="Enviando" />;
  if (status === "sent") return <Check className="h-3 w-3" aria-label="Enviada" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" aria-label="Entregue" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-sky-500 dark:text-sky-300" aria-label="Lida" />;
  if (status === "failed") return <X className="h-3 w-3 text-destructive" aria-label="Falhou" />;
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
    <Tabs defaultValue="contact" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b bg-transparent p-0">
        <TabsTrigger
          value="contact"
          className="flex-1 rounded-none border-b-2 border-transparent bg-transparent py-3 text-sm shadow-none data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-emerald-700 data-[state=active]:shadow-none dark:data-[state=active]:text-emerald-300"
        >
          Contato
        </TabsTrigger>
        <TabsTrigger
          value="notes"
          className="flex-1 rounded-none border-b-2 border-transparent bg-transparent py-3 text-sm shadow-none data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-emerald-700 data-[state=active]:shadow-none dark:data-[state=active]:text-emerald-300"
        >
          Notas
        </TabsTrigger>
      </TabsList>
      <TabsContent value="contact" className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-2 pb-5 text-center">
          <ContactAvatar name={conv?.contact_name} phone={conv?.contact_phone} size="lg" />
          <div className="text-base font-semibold">
            {conv?.contact_name || formatPhone(conv?.contact_phone)}
          </div>
          <div className="text-xs text-muted-foreground">
            {conv?.contact_name ? formatPhone(conv?.contact_phone) : "Clique para adicionar nome"}
          </div>
        </div>
        <dl className="divide-y border-t">
          {[
            { icon: User, label: "Nome", value: conv?.contact_name || "—" },
            { icon: Phone, label: "Telefone", value: formatPhone(conv?.contact_phone) || "—" },
            { icon: Hash, label: "Número de origem", value: connection?.phone_number ?? "—" },
            { icon: Megaphone, label: "Campanha", value: campaign?.name ?? "—" },
            {
              icon: Clock,
              label: "Janela 24h",
              value: conv?.service_window_expires_at
                ? new Date(conv.service_window_expires_at).toLocaleString("pt-BR")
                : "—",
            },
          ].map((row) => (
            <div key={row.label} className="flex items-start gap-3 py-3">
              <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="break-words text-sm">{row.value}</dd>
              </div>
            </div>
          ))}
        </dl>
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
