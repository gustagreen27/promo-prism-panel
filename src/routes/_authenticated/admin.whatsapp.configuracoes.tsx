import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listSettings, upsertSetting } from "@/lib/settings.functions";
import { sendTestTemplate, listWabaTemplates } from "@/lib/whatsapp-test.functions";

const KEY = "whatsapp_credentials";

type Creds = {
  phone_number_id: string;
  waba_id: string;
  business_id: string;
  access_token: string;
};

const EMPTY: Creds = { phone_number_id: "", waba_id: "", business_id: "", access_token: "" };

export const Route = createFileRoute("/_authenticated/admin/whatsapp/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações WhatsApp" }] }),
  component: Page,
});

type TplComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text?: string; url?: string; example?: string[] }>;
};
type Tpl = {
  name: string;
  status: string;
  language: string;
  category: string;
  components: TplComponent[];
};

function countVars(text?: string) {
  if (!text) return 0;
  const m = text.match(/{{\s*\d+\s*}}/g);
  return m ? m.length : 0;
}

function findDynamicUrlButton(tpl?: Tpl) {
  if (!tpl) return null;
  const btnComp = tpl.components.find((c) => c.type?.toUpperCase() === "BUTTONS");
  if (!btnComp?.buttons) return null;
  const idx = btnComp.buttons.findIndex(
    (b) => b.type?.toUpperCase() === "URL" && (b.url ?? "").includes("{{"),
  );
  if (idx < 0) return null;
  return { index: idx, url: btnComp.buttons[idx].url ?? "" };
}

function Page() {
  const listFn = useServerFn(listSettings);
  const upsertFn = useServerFn(upsertSetting);
  const sendFn = useServerFn(sendTestTemplate);
  const templatesFn = useServerFn(listWabaTemplates);
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => listFn() });
  const [form, setForm] = useState<Creds>(EMPTY);

  useEffect(() => {
    const row = rows.find((r: any) => r.key === KEY);
    if (row?.value) setForm({ ...EMPTY, ...(row.value as Creds) });
  }, [rows]);

  const set = (k: keyof Creds, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: async () => upsertFn({ data: { key: KEY, value: form } }),
    onSuccess: () => {
      toast.success("Credenciais salvas");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const credsReady = Boolean(form.waba_id && form.access_token);
  const tplQuery = useQuery({
    queryKey: ["waba-templates"],
    queryFn: () => templatesFn() as Promise<Tpl[]>,
    enabled: credsReady,
  });

  const [testTo, setTestTo] = useState("5562984817929");
  const [templateName, setTemplateName] = useState("frgc_01");
  const [params, setParams] = useState<string[]>(["", "", "", ""]);
  const [buttonParam, setButtonParam] = useState("");

  const selected = useMemo(
    () => tplQuery.data?.find((t) => t.name === templateName),
    [tplQuery.data, templateName],
  );
  const language = selected?.language ?? "pt_BR";
  const bodyComp = selected?.components.find((c) => c.type?.toUpperCase() === "BODY");
  const bodyVars = countVars(bodyComp?.text);
  const dynBtn = findDynamicUrlButton(selected);

  useEffect(() => {
    if (!selected) return;
    setParams((prev) => {
      const next = [...prev];
      next.length = bodyVars;
      for (let i = 0; i < bodyVars; i++) next[i] = next[i] ?? "";
      return next;
    });
    if (!dynBtn) setButtonParam("");
  }, [selected, bodyVars, dynBtn]);

  const sendMut = useMutation({
    mutationFn: async () =>
      sendFn({
        data: {
          to: testTo,
          template_name: templateName,
          language,
          params,
          ...(dynBtn && buttonParam
            ? { button_url_param: buttonParam, button_index: dynBtn.index }
            : {}),
        },
      }),
    onSuccess: (r: any) => toast.success(`Enviado ✓ ${r?.message_id ?? ""}`),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar"),
  });

  const approved = (tplQuery.data ?? []).filter((t) => t.status?.toUpperCase() === "APPROVED");

  return (
    <>
      <PageHeader
        title="Configurações WhatsApp Cloud API"
        description="Credenciais oficiais da Meta usadas pelo painel para conectar à API."
      />
      <div className="rounded-xl border bg-card p-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Phone Number ID</Label>
              <Input value={form.phone_number_id} onChange={(e) => set("phone_number_id", e.target.value)} />
            </div>
            <div>
              <Label>WABA ID</Label>
              <Input value={form.waba_id} onChange={(e) => set("waba_id", e.target.value)} />
            </div>
            <div>
              <Label>Business ID</Label>
              <Input value={form.business_id} onChange={(e) => set("business_id", e.target.value)} />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input type="password" value={form.access_token} onChange={(e) => set("access_token", e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? "Salvando…" : "Salvar credenciais"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-6">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold">Enviar mensagem de teste</div>
          <Button
            variant="outline"
            size="sm"
            disabled={!credsReady || tplQuery.isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ["waba-templates"] })}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${tplQuery.isFetching ? "animate-spin" : ""}`} />
            Recarregar templates
          </Button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Templates aprovados são buscados diretamente da sua WABA.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Destino (com DDI)</Label>
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="5562984817929" />
          </div>
          <div>
            <Label>Template ({language})</Label>
            {credsReady && approved.length > 0 ? (
              <Select value={templateName} onValueChange={setTemplateName}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((t) => (
                    <SelectItem key={`${t.name}-${t.language}`} value={t.name}>
                      {t.name} · {t.language} · {t.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={credsReady ? "Nenhum aprovado — digite o nome" : "Salve credenciais para listar"}
              />
            )}
          </div>

          {bodyComp?.text && (
            <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              <div className="mb-1 font-semibold uppercase text-muted-foreground">Corpo</div>
              {bodyComp.text}
            </div>
          )}

          {Array.from({ length: bodyVars }).map((_, i) => (
            <div key={i}>
              <Label>{`{{${i + 1}}}`}</Label>
              <Input
                value={params[i] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setParams((p) => {
                    const n = [...p];
                    n[i] = v;
                    return n;
                  });
                }}
              />
            </div>
          ))}

          {dynBtn && (
            <div className="sm:col-span-2">
              <Label>Parâmetro do botão URL (index {dynBtn.index})</Label>
              <Input
                value={buttonParam}
                onChange={(e) => setButtonParam(e.target.value)}
                placeholder={dynBtn.url}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Substitui o placeholder na URL do botão: <code>{dynBtn.url}</code>
              </p>
            </div>
          )}

          <div className="sm:col-span-2 flex justify-end">
            <Button disabled={sendMut.isPending || !templateName} onClick={() => sendMut.mutate()}>
              <Send className="mr-2 h-4 w-4" />
              {sendMut.isPending ? "Enviando…" : "Enviar teste"}
            </Button>
          </div>
        </div>

        {tplQuery.error && (
          <p className="mt-3 text-xs text-destructive">
            {(tplQuery.error as any)?.message ?? "Erro ao listar templates"}
          </p>
        )}
      </div>
    </>
  );
}
