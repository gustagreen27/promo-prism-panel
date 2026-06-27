import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { listConversations, listMessages } from "@/lib/inbox.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/inbox")({
  head: () => ({ meta: [{ title: "Inbox WhatsApp" }] }),
  component: Page,
});

function Page() {
  const convFn = useServerFn(listConversations);
  const msgFn = useServerFn(listMessages);
  const { data: convs = [] } = useQuery({ queryKey: ["wa-conv"], queryFn: () => convFn() });
  const [phone, setPhone] = useState<string | null>(null);
  const { data: msgs = [] } = useQuery({ enabled: !!phone, queryKey: ["wa-msgs", phone], queryFn: () => msgFn({ data: { phone: phone! } }) });

  return (
    <>
      <PageHeader title="Inbox" description="Mensagens recebidas dos contatos." />
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="rounded-xl border bg-card">
          {convs.length === 0 ? <EmptyState title="Sem conversas" />
          : <div className="divide-y">
              {convs.map((c: any) => (
                <button key={c.phone} onClick={() => setPhone(c.phone)}
                  className={`w-full p-3 text-left hover:bg-muted ${phone === c.phone ? "bg-muted" : ""}`}>
                  <div className="font-medium text-sm">{c.contact?.name ?? c.phone}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.body ?? "(sem texto)"}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDate(c.received_at)}</div>
                </button>
              ))}
            </div>}
        </div>
        <div className="rounded-xl border bg-card p-4 min-h-[400px]">
          {!phone ? <div className="text-sm text-muted-foreground">Selecione uma conversa.</div>
          : msgs.length === 0 ? <div className="text-sm text-muted-foreground">Sem mensagens.</div>
          : <div className="space-y-2">
              {msgs.map((m: any) => (
                <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === "in" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground"}`}>
                  <div>{m.body ?? `(${m.message_type})`}</div>
                  <div className="mt-1 text-[10px] opacity-70">{formatDate(m.received_at)}</div>
                </div>
              ))}
            </div>}
        </div>
      </div>
    </>
  );
}
