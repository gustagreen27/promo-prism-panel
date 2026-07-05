import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getBillingSettings, adminUpdateBillingSettings,
  adminListWorkspacesWithBalance, adminSetCustomPrice, adminSetCustomMinimumMessages,
} from "@/lib/billing.functions";
import { DollarSign, Building2, Calculator, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/precificacao")({
  head: () => ({ meta: [{ title: "Precificação — Admin" }] }),
  component: Page,
});

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function centsToStr(cents: number) { return (cents / 100).toFixed(2).replace(".", ","); }
function parseBRL(s: string): number { return Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100) || 0; }

function Page() {
  const getSettings = useServerFn(getBillingSettings);
  const updateSettings = useServerFn(adminUpdateBillingSettings);
  const listWs = useServerFn(adminListWorkspacesWithBalance);
  const setPrice = useServerFn(adminSetCustomPrice);
  const setMin = useServerFn(adminSetCustomMinimumMessages);
  const qc = useQueryClient();

  const { data: settings } = useQuery({ queryKey: ["billing-settings"], queryFn: () => getSettings() });
  const { data: workspaces = [] } = useQuery({ queryKey: ["admin-ws-balance"], queryFn: () => listWs() });

  // Global defaults form
  const [defPrice, setDefPrice] = useState("0,23");
  const [defMinMsgs, setDefMinMsgs] = useState("2500");
  const [defMinDep, setDefMinDep] = useState("150,00");

  useMemo(() => {
    if (settings) {
      setDefPrice(centsToStr(settings.default_price_cents));
      setDefMinMsgs(String(settings.default_minimum_messages ?? 2500));
      setDefMinDep(centsToStr(settings.minimum_deposit_cents));
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.default_price_cents, settings?.default_minimum_messages, settings?.minimum_deposit_cents]);

  const save = useMutation({
    mutationFn: () => updateSettings({
      data: {
        default_price_cents: parseBRL(defPrice),
        default_minimum_messages: parseInt(defMinMsgs, 10) || 0,
        minimum_deposit_cents: parseBRL(defMinDep),
      },
    }),
    onSuccess: () => {
      toast.success("Preços globais atualizados");
      qc.invalidateQueries({ queryKey: ["billing-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-ws-balance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  // Simulator
  const [simDeposit, setSimDeposit] = useState("500,00");
  const simCents = parseBRL(simDeposit);
  const simPrice = parseBRL(defPrice) || 23;
  const simMessages = simPrice > 0 ? Math.floor(simCents / simPrice) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DollarSign}
        title="Precificação"
        description="Preço padrão por disparo e overrides por workspace"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Preço global padrão
            </CardTitle>
            <CardDescription>Aplica a todos os workspaces sem preço customizado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Preço por disparo (R$)</Label>
                <Input value={defPrice} onChange={(e) => setDefPrice(e.target.value)} placeholder="0,23" />
                <div className="text-[11px] text-muted-foreground">Ex.: <b>0,23</b> = R$ 0,23</div>
              </div>
              <div className="space-y-1.5">
                <Label>Mínimo de mensagens</Label>
                <Input value={defMinMsgs} onChange={(e) => setDefMinMsgs(e.target.value)} placeholder="2500" />
              </div>
              <div className="space-y-1.5">
                <Label>Depósito mínimo (R$)</Label>
                <Input value={defMinDep} onChange={(e) => setDefMinDep(e.target.value)} placeholder="150,00" />
              </div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar preços globais
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /> Simulador</CardTitle>
            <CardDescription>Depósito → mensagens possíveis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Depósito (R$)</Label>
              <Input value={simDeposit} onChange={(e) => setSimDeposit(e.target.value)} />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <div className="text-xs uppercase text-muted-foreground">Disparos possíveis</div>
              <div className="mt-1 text-3xl font-bold text-primary tabular-nums">{simMessages.toLocaleString("pt-BR")}</div>
              <div className="mt-1 text-xs text-muted-foreground">@ {fmtBRL(simPrice)} por disparo</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Preços por workspace</CardTitle>
          <CardDescription>Deixe em branco para usar o preço global.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Preço custom (R$)</TableHead>
                <TableHead>Mín. custom (msgs)</TableHead>
                <TableHead>Efetivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(workspaces as any[]).map((w) => (
                <WorkspaceRow
                  key={w.id}
                  ws={w}
                  defaultPrice={settings?.default_price_cents ?? 23}
                  defaultMin={settings?.default_minimum_messages ?? 2500}
                  onSavePrice={async (cents) => {
                    await setPrice({ data: { workspace_id: w.id, custom_price_cents: cents } });
                    toast.success(`Preço atualizado para ${w.name}`);
                    qc.invalidateQueries({ queryKey: ["admin-ws-balance"] });
                  }}
                  onSaveMin={async (n) => {
                    await setMin({ data: { workspace_id: w.id, custom_minimum_messages: n } });
                    toast.success(`Mínimo atualizado para ${w.name}`);
                    qc.invalidateQueries({ queryKey: ["admin-ws-balance"] });
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkspaceRow({ ws, defaultPrice, defaultMin, onSavePrice, onSaveMin }: {
  ws: any; defaultPrice: number; defaultMin: number;
  onSavePrice: (cents: number | null) => Promise<void>;
  onSaveMin: (n: number | null) => Promise<void>;
}) {
  const [price, setPrice] = useState(ws.custom_price_cents != null ? centsToStr(ws.custom_price_cents) : "");
  const [min, setMin] = useState(ws.custom_minimum_messages != null ? String(ws.custom_minimum_messages) : "");
  const [savingP, setSavingP] = useState(false);
  const [savingM, setSavingM] = useState(false);
  const effectivePrice = ws.custom_price_cents ?? defaultPrice;
  const effectiveMin = ws.custom_minimum_messages ?? defaultMin;
  const isPromo = ws.custom_price_cents != null && ws.custom_price_cents < defaultPrice;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{ws.name}</div>
        <div className="text-xs text-muted-foreground">{ws.plan}</div>
      </TableCell>
      <TableCell className="tabular-nums">{fmtBRL(ws.balance_cents ?? 0)}</TableCell>
      <TableCell>
        <div className="flex gap-1.5">
          <Input value={price} onChange={(e) => setPrice(e.target.value)} className="h-8 w-24" placeholder="—" />
          <Button size="sm" variant="outline" disabled={savingP} onClick={async () => {
            setSavingP(true);
            try { await onSavePrice(price ? parseBRL(price) : null); } finally { setSavingP(false); }
          }}>OK</Button>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-1.5">
          <Input value={min} onChange={(e) => setMin(e.target.value)} className="h-8 w-24" placeholder="—" />
          <Button size="sm" variant="outline" disabled={savingM} onClick={async () => {
            setSavingM(true);
            try { await onSaveMin(min ? parseInt(min, 10) : null); } finally { setSavingM(false); }
          }}>OK</Button>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="tabular-nums font-medium">{fmtBRL(effectivePrice)}</span>
          {isPromo && <Badge className="bg-emerald-500/15 text-emerald-600">promo</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">mín. {effectiveMin.toLocaleString("pt-BR")} msgs</div>
      </TableCell>
    </TableRow>
  );
}
