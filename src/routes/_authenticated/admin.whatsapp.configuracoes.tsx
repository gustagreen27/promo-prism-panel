import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSettings, upsertSetting } from "@/lib/settings.functions";
import { sendTestTemplate } from "@/lib/whatsapp-test.functions";

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

function Page() {
  const listFn = useServerFn(listSettings);
  const upsertFn = useServerFn(upsertSetting);
  const sendFn = useServerFn(sendTestTemplate);
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => listFn() });
  const [form, setForm] = useState<Creds>(EMPTY);
  const [testTo, setTestTo] = useState("5562984817929");
  const [templateName, setTemplateName] = useState("frgc_01");
  const [language, setLanguage] = useState("pt_BR");
  const [p1, setP1] = useState("Cliente");
  const [p2, setP2] = useState("sua vaga foi confirmada");
  const [p3, setP3] = useState("Nos vemos em breve");
  const [p4, setP4] = useState("confirmar presença");

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

  const sendMut = useMutation({
    mutationFn: async () =>
      sendFn({
        data: {
          to: testTo,
          template_name: templateName,
          language,
          params: [p1, p2, p3, p4],
        },
      }),
    onSuccess: (r: any) => toast.success(`Enviado ✓ ${r?.message_id ?? ""}`),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar"),
  });

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
              <Input value={form.phone_number_id} onChange={(e) => set("phone_number_id", e.target.value)} placeholder="Ex.: 1234567890" />
            </div>
            <div>
              <Label>WABA ID</Label>
              <Input value={form.waba_id} onChange={(e) => set("waba_id", e.target.value)} placeholder="WhatsApp Business Account ID" />
            </div>
            <div>
              <Label>Business ID</Label>
              <Input value={form.business_id} onChange={(e) => set("business_id", e.target.value)} placeholder="Business Manager ID" />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input type="password" value={form.access_token} onChange={(e) => set("access_token", e.target.value)} placeholder="EAAG..." />
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
        <div className="mb-1 text-sm font-semibold">Enviar mensagem de teste</div>
        <p className="mb-4 text-xs text-muted-foreground">
          Usa o Phone Number ID + Access Token salvos acima para disparar um template aprovado.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Destino (com DDI)</Label>
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="5562984817929" />
          </div>
          <div>
            <Label>Template</Label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          </div>
          <div>
            <Label>Idioma</Label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt_BR" />
          </div>
          <div />
          <div>
            <Label>{"{{1}}"} Nome</Label>
            <Input value={p1} onChange={(e) => setP1(e.target.value)} />
          </div>
          <div>
            <Label>{"{{2}}"} Aviso</Label>
            <Input value={p2} onChange={(e) => setP2(e.target.value)} />
          </div>
          <div>
            <Label>{"{{3}}"} Complemento</Label>
            <Input value={p3} onChange={(e) => setP3(e.target.value)} />
          </div>
          <div>
            <Label>{"{{4}}"} Ação do botão</Label>
            <Input value={p4} onChange={(e) => setP4(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button disabled={sendMut.isPending} onClick={() => sendMut.mutate()}>
              <Send className="mr-2 h-4 w-4" />
              {sendMut.isPending ? "Enviando…" : "Enviar teste"}
            </Button>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Dica: você também pode cadastrar credenciais específicas por número em <strong>Números</strong>.
      </p>
    </>
  );
}
