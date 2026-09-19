// Atendimento no painel do cliente: conversas e respostas dos leads
// nos números liberados pelo admin para os disparos deste cliente.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare, Search, Send, Phone } from "lucide-react";
import {
  listMyAttendanceNumbers, listMyAttendanceConversations, getMyAttendanceMessages,
  markMyAttendanceRead, sendMyAttendanceMessage,
} from "@/lib/client-attendance.functions";

export const Route = createFileRoute("/painel/atendimento")({
  head: () => ({
    meta: [
      { title: "Atendimento — next Disparos" },
      { name: "description", content: "Converse com os leads que responderam aos seus disparos no WhatsApp." },
      { property: "og:title", content: "Atendimento — next Disparos" },
      { property: "og:description", content: "Converse com os leads que responderam aos seus disparos no WhatsApp." },
    ],
  }),
  component: Page,
});

function fmtPhone(p?: string | null) {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return p;
}
function fmtTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Page() {
  const qc = useQueryClient();
  const numbersFn = useServerFn(listMyAttendanceNumbers);
  const convsFn = useServerFn(listMyAttendanceConversations);
  const msgsFn = useServerFn(getMyAttendanceMessages);
  const readFn = useServerFn(markMyAttendanceRead);
  const sendFn = useServerFn(sendMyAttendanceMessage);

  const [numberId, setNumberId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: numbers = [], isLoading: loadingNumbers } = useQuery({
    queryKey: ["panel-atd-numbers"],
    queryFn: () => numbersFn(),
    refetchInterval: 60_000,
  });

  const { data: conversations = [], isLoading: loadingConvs } = useQuery({
    queryKey: ["panel-atd-convs", numberId, search],
    queryFn: () =>
      convsFn({
        data: {
          phone_number_id: numberId === "all" ? undefined : numberId,
          search: search.trim() || undefined,
        },
      }),
    refetchInterval: 15_000,
  });

  const { data: thread, isFetching: loadingThread } = useQuery({
    queryKey: ["panel-atd-thread", activeId],
    queryFn: () => msgsFn({ data: { conversation_id: activeId! } }),
    enabled: !!activeId,
    refetchInterval: 10_000,
  });

  const messages = (thread as any)?.messages ?? [];
  const conv = (thread as any)?.conversation ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  useEffect(() => {
    if (!activeId) return;
    readFn({ data: { conversation_id: activeId } })
      .then(() => qc.invalidateQueries({ queryKey: ["panel-atd-convs"] }))
      .catch(() => {});
  }, [activeId]);

  const windowOpen = useMemo(() => {
    if (!conv) return false;
    if (conv.service_window_status !== "open") return false;
    return !conv.service_window_expires_at || new Date(conv.service_window_expires_at).getTime() > Date.now();
  }, [conv]);

  async function send() {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      await sendFn({ data: { conversation_id: activeId, body: draft.trim() } });
      setDraft("");
      qc.invalidateQueries({ queryKey: ["panel-atd-thread", activeId] });
      qc.invalidateQueries({ queryKey: ["panel-atd-convs"] });
      toast.success("Mensagem enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  if (loadingNumbers) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando atendimento…
      </div>
    );
  }

  if (!numbers.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" /> Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Nenhum número liberado para atendimento ainda.</p>
          <p>Assim que um número for vinculado ao seu disparo, as conversas dos leads aparecem aqui.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Atendimento</h1>
          <p className="text-sm text-muted-foreground">Converse com os leads que responderam aos seus disparos.</p>
        </div>
        <Select value={numberId} onValueChange={(v) => { setNumberId(v); setActiveId(null); }}>
          <SelectTrigger className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os números</SelectItem>
            {numbers.map((n) => (
              <SelectItem key={n.phone_number_id} value={n.phone_number_id}>
                {fmtPhone(n.phone) ?? n.phone_number_id}
                {n.unread ? ` · ${n.unread} novas` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Lista de conversas */}
        <Card className="overflow-hidden">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar número ou mensagem"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loadingConvs ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando conversas…</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</div>
            ) : (
              conversations.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full flex-col gap-1 border-b px-3 py-2.5 text-left transition hover:bg-muted/60 ${
                    activeId === c.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{fmtPhone(c.contact_phone)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{fmtTime(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{c.last_message_preview ?? "—"}</span>
                    {c.unread_count > 0 && (
                      <Badge className="shrink-0 px-1.5 py-0 text-[10px]">{c.unread_count}</Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Conversa */}
        <Card className="flex min-h-[60vh] flex-col overflow-hidden">
          {!activeId ? (
            <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
              Selecione uma conversa para ver as mensagens.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {fmtPhone(conv?.contact_phone)}
                  </div>
                  {conv?.contact_name && (
                    <div className="truncate text-xs text-muted-foreground">{conv.contact_name}</div>
                  )}
                </div>
                <Badge variant="outline" className={windowOpen ? "border-emerald-500/40 text-emerald-600" : "text-muted-foreground"}>
                  {windowOpen ? "Janela aberta (24h)" : "Janela fechada"}
                </Badge>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
                {loadingThread && messages.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Carregando mensagens…</div>
                ) : (
                  messages.map((m: any) => (
                    <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          m.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-card"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {m.body ?? (m.template_name ? `[template] ${m.template_name}` : m.message_type)}
                        </div>
                        <div className={`mt-1 text-[10px] ${m.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {fmtTime(m.created_at)}
                          {m.direction === "outbound" ? ` · ${m.status}` : ""}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t p-3">
                {windowOpen ? (
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Escreva sua resposta…"
                      rows={2}
                      className="resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <Button onClick={() => void send()} disabled={sending || !draft.trim()}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A janela de 24 horas está encerrada. Você poderá responder assim que o lead enviar uma nova mensagem.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
