import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { listNumbers, updateNumber } from "@/lib/whatsapp-numbers.functions";
import { listSettings, upsertSetting } from "@/lib/settings.functions";

const KEY = "whatsapp_webhook";

const EVENTS = [
  { id: "messages", label: "messages", hint: "Mensagens recebidas e status de entrega" },
  { id: "message_template_status_update", label: "message_template_status_update", hint: "Aprovação de templates" },
  { id: "account_update", label: "account_update", hint: "Alterações na conta WABA" },
  { id: "phone_number_quality_update", label: "phone_number_quality_update", hint: "Qualidade do número" },
  { id: "phone_number_name_update", label: "phone_number_name_update", hint: "Nome de exibição" },
];

type WebhookConfig = {
  callback_url: string;
  verify_token: string;
  graph_api_version: string;
  events: string[];
};

export const Route = createFileRoute("/_authenticated/admin/whatsapp/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks WhatsApp" }] }),
  component: Page,
});

function Page() {
  const numbersFn = useServerFn(listNumbers);
  const updateNumberFn = useServerFn(updateNumber);
  const listFn = useServerFn(listSettings);
  const upsertFn = useServerFn(upsertSetting);
  const qc = useQueryClient();

  const { data: rows = [], isLoading: numbersLoading } = useQuery({
    queryKey: ["wa-numbers"],
    queryFn: () => numbersFn(),
  });
  const { data: settings = [], isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => listFn() });

  const defaultUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/public/whatsapp/webhook`;
  }, []);

  const [form, setForm] = useState<WebhookConfig>({
    callback_url: defaultUrl,
    verify_token: "",
    graph_api_version: "v21.0",
    events: ["messages", "message_template_status_update"],
  });
  const [visibleTokens, setVisibleTokens] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const row = settings.find((r: any) => r.key === KEY);
    if (row?.value) {
      setForm((f) => ({ ...f, ...(row.value as WebhookConfig) }));
    } else if (!form.callback_url) {
      setForm((f) => ({ ...f, callback_url: defaultUrl }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const set = <K extends keyof WebhookConfig>(k: K, v: WebhookConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleEvent = (id: string, on: boolean) =>
    setForm((f) => ({
      ...f,
      events: on ? Array.from(new Set([...f.events, id])) : f.events.filter((e) => e !== id),
    }));

  const saveMut = useMutation({
    mutationFn: async () => upsertFn({ data: { key: KEY, value: form } }),
    onSuccess: () => {
      toast.success("Configuração de webhook salva");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copiado");
  };

  const generateToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    set("verify_token", token);
  };

  const regenerateConnectionToken = (id: string) => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return token;
  };

  const updateTokenMut = useMutation({
    mutationFn: async ({ id, token }: { id: string; token: string }) => {
      await updateNumberFn({ data: { id, verify_token: token } });
      return { id, token };
    },
    onSuccess: ({ token }) => {
      toast.success("Token de verificação regenerado");
      qc.invalidateQueries({ queryKey: ["wa-numbers"] });
      copy(token);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao regenerar token"),
  });

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Configure a URL de callback e os eventos que a Meta enviará ao painel."
      />

      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4 space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <>
              <div>
                <Label>Callback URL</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    value={form.callback_url}
                    onChange={(e) => set("callback_url", e.target.value)}
                    placeholder={defaultUrl}
                  />
                  <Button variant="outline" size="sm" onClick={() => copy(form.callback_url)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cole no Meta App → WhatsApp → Configuration → Webhook → Callback URL.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Verify Token</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      value={form.verify_token}
                      onChange={(e) => set("verify_token", e.target.value)}
                      placeholder="Segredo compartilhado com a Meta"
                    />
                    <Button variant="outline" size="sm" onClick={generateToken}>
                      Gerar
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Versão da Graph API</Label>
                  <Input
                    value={form.graph_api_version}
                    onChange={(e) => set("graph_api_version", e.target.value)}
                    placeholder="v21.0"
                  />
                </div>
              </div>

              <div>
                <Label>Eventos / Callbacks</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {EVENTS.map((ev) => {
                    const checked = form.events.includes(ev.id);
                    return (
                      <label
                        key={ev.id}
                        className="flex items-start gap-2 rounded border p-2 text-sm cursor-pointer hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleEvent(ev.id, Boolean(v))}
                        />
                        <div>
                          <div className="font-medium">{ev.label}</div>
                          <div className="text-xs text-muted-foreground">{ev.hint}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  No Meta App, inscreva-se nesses mesmos campos ao configurar o webhook.
                </p>
              </div>

              <div className="flex justify-end">
                <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? "Salvando…" : "Salvar configuração"}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Verify Tokens por número</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada conexão precisa de um verify token. A Meta usa esse token para validar a URL de callback acima.
          </p>
          <div className="mt-2 grid gap-2">
            {numbersLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
            {rows.length === 0 && !numbersLoading && (
              <div className="text-sm text-muted-foreground">
                Cadastre um número para configurar o verify token específico.
              </div>
            )}
            {rows.map((r: any) => {
              const visible = visibleTokens[r.id] ?? false;
              const token = r.verify_token ?? "";
              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.display_phone ?? r.phone ?? "—"} · {r.phone_number_id ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      type={visible ? "text" : "password"}
                      value={token}
                      className="w-[200px] font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      title={visible ? "Ocultar" : "Mostrar"}
                      onClick={() =>
                        setVisibleTokens((prev) => ({ ...prev, [r.id]: !visible }))
                      }
                    >
                      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Copiar"
                      disabled={!token}
                      onClick={() => copy(token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Regenerar"
                      disabled={updateTokenMut.isPending}
                      onClick={() =>
                        updateTokenMut.mutate({ id: r.id, token: regenerateConnectionToken(r.id) })
                      }
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
