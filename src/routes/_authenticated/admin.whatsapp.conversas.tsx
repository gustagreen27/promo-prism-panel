import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, MessageCircle, Phone, Video, MoreVertical, Smile, Paperclip, Send, CheckCheck, Check } from "lucide-react";
import { listConversations, listMessages } from "@/lib/inbox.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/conversas")({
  head: () => ({ meta: [{ title: "Conversas — WhatsApp" }] }),
  component: Page,
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Page() {
  const convFn = useServerFn(listConversations);
  const msgFn = useServerFn(listMessages);
  const { data: convs = [], isLoading: convsLoading } = useQuery({
    queryKey: ["wa-conv"],
    queryFn: () => convFn(),
    refetchInterval: 15_000,
  });
  const [phone, setPhone] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { data: msgs = [], isLoading: msgsLoading } = useQuery({
    enabled: !!phone,
    queryKey: ["wa-msgs", phone],
    queryFn: () => msgFn({ data: { phone: phone! } }),
    refetchInterval: 10_000,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convs as any[];
    return (convs as any[]).filter((c) => {
      const name = (c.contact?.name ?? "").toLowerCase();
      return name.includes(q) || String(c.phone).includes(q);
    });
  }, [convs, query]);

  const active = (filtered as any[]).find((c) => c.phone === phone) ?? null;

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 md:-m-6">
      <div className="grid h-full grid-cols-1 md:grid-cols-[340px_1fr] xl:grid-cols-[340px_1fr_320px] overflow-hidden border-t bg-background">
        {/* Left — conversation list */}
        <aside className="flex min-w-0 flex-col border-r bg-card">
          <div className="border-b px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-semibold">Conversas</h2>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {(convs as any[]).length}
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome ou número"
                className="h-9 pl-9"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa</div>
            ) : (
              <ul className="divide-y">
                {filtered.map((c: any) => {
                  const name = c.contact?.name ?? c.phone;
                  const isSel = c.phone === phone;
                  return (
                    <li key={c.phone}>
                      <button
                        onClick={() => setPhone(c.phone)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60",
                          isSel && "bg-primary/5",
                        )}
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {initials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{name}</p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatTime(c.received_at)}
                            </span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.body ?? "(sem texto)"}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Center — thread */}
        <section className="flex min-w-0 flex-col bg-[oklch(0.985_0.005_258)]">
          {!phone || !active ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <MessageCircle className="h-7 w-7" />
                </div>
                <h3 className="text-base font-semibold">Selecione uma conversa</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha um contato à esquerda para ver o histórico de mensagens.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between border-b bg-card px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials(active.contact?.name ?? active.phone)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {active.contact?.name ?? active.phone}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{active.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Video className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
                {msgsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-2/3" />
                    <Skeleton className="ml-auto h-10 w-1/2" />
                    <Skeleton className="h-10 w-1/3" />
                  </div>
                ) : (msgs as any[]).length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground">Sem mensagens.</div>
                ) : (
                  <div className="mx-auto flex max-w-2xl flex-col gap-2">
                    {(msgs as any[]).map((m: any) => {
                      const isIn = m.direction === "in";
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                            isIn
                              ? "self-start rounded-tl-sm bg-card text-foreground"
                              : "self-end rounded-tr-sm bg-primary text-primary-foreground",
                          )}
                        >
                          <div className="whitespace-pre-wrap break-words">
                            {m.body ?? `(${m.message_type})`}
                          </div>
                          <div
                            className={cn(
                              "mt-1 flex items-center justify-end gap-1 text-[10px]",
                              isIn ? "text-muted-foreground" : "text-primary-foreground/70",
                            )}
                          >
                            <span>{formatTime(m.received_at)}</span>
                            {!isIn && <CheckCheck className="h-3 w-3" />}
                            {isIn && <Check className="h-3 w-3 opacity-0" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <footer className="border-t bg-card px-3 py-3">
                <div className="mx-auto max-w-2xl space-y-2">
                  <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Envio manual de mensagens ainda não está disponível nesta tela.
                    Use <strong>Disparos</strong> para enviar via template aprovado,
                    ou responda pelo app oficial do WhatsApp. Este painel é somente leitura
                    (histórico do webhook Meta) enquanto a janela de 24h de sessão não é
                    integrada ao Cloud API por aqui.
                  </div>
                </div>
              </footer>
            </>
          )}
        </section>

        {/* Right — contact panel */}
        <aside className="hidden min-w-0 flex-col border-l bg-card xl:flex">
          {active ? (
            <div className="flex h-full flex-col overflow-y-auto">
              <div className="flex flex-col items-center gap-3 border-b px-6 py-8 text-center">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                    {initials(active.contact?.name ?? active.phone)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-base font-semibold">{active.contact?.name ?? active.phone}</p>
                  <p className="text-xs text-muted-foreground">{active.phone}</p>
                </div>
              </div>
              <div className="space-y-4 p-6 text-sm">
                <Section title="Informações">
                  <Row label="Telefone" value={active.phone} />
                  <Row label="Última mensagem" value={formatTime(active.received_at)} />
                  <Row label="Direção" value={active.direction === "in" ? "Recebida" : "Enviada"} />
                </Section>
                <Section title="Atividade">
                  <Row label="Mensagens" value={String((msgs as any[]).length)} />
                </Section>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Selecione uma conversa para ver detalhes.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </p>
      <div className="space-y-1.5 rounded-lg border bg-background/50 p-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
  );
}
