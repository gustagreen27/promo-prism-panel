import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  adminListWorkspacesWithBalance, adminSetCustomPrice, adminSetCustomMinimumMessages, adminAdjustWallet, adminListAllTransactions,
} from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Admin" }] }),
  component: Page,
});

const fmt = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TX_LABEL: Record<string, string> = {
  deposit: "Depósito",
  message_charge: "Cobrança",
  refund: "Reembolso",
  adjustment: "Ajuste",
  reservation_hold: "Reserva",
  reservation_release: "Liberação",
};

function Page() {
  const listWs = useServerFn(adminListWorkspacesWithBalance);
  const listTx = useServerFn(adminListAllTransactions);
  const setPrice = useServerFn(adminSetCustomPrice);
  const setMinMsg = useServerFn(adminSetCustomMinimumMessages);
  const adjust = useServerFn(adminAdjustWallet);
  const qc = useQueryClient();

  const { data: workspaces = [] } = useQuery({ queryKey: ["admin-ws-balance"], queryFn: () => listWs() });
  const { data: txs = [] } = useQuery({
    queryKey: ["admin-all-tx"],
    queryFn: () => listTx({ data: { limit: 200 } }),
  });

  const [modal, setModal] = useState<null | { ws: any; type: "price" | "minmsg" | "adjust" }>(null);
  const [priceStr, setPriceStr] = useState("");
  const [minMsgStr, setMinMsgStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [signMul, setSignMul] = useState(1);

  const parse = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);

  const savePrice = useMutation({
    mutationFn: () => setPrice({ data: {
      workspace_id: modal!.ws.id,
      custom_price_cents: priceStr.trim() === "" ? null : parse(priceStr),
    } }),
    onSuccess: () => { toast.success("Preço atualizado"); qc.invalidateQueries({ queryKey: ["admin-ws-balance"] }); setModal(null); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const saveMinMsg = useMutation({
    mutationFn: () => setMinMsg({ data: {
      workspace_id: modal!.ws.id,
      custom_minimum_messages: minMsgStr.trim() === "" ? null : Math.max(1, parseInt(minMsgStr, 10)),
    } }),
    onSuccess: () => { toast.success("Mínimo atualizado"); qc.invalidateQueries({ queryKey: ["admin-ws-balance"] }); setModal(null); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const saveAdjust = useMutation({
    mutationFn: () => adjust({ data: {
      workspace_id: modal!.ws.id,
      amount_cents: parse(amountStr) * signMul,
      description,
    } }),
    onSuccess: () => {
      toast.success("Ajuste registrado");
      qc.invalidateQueries({ queryKey: ["admin-ws-balance"] });
      qc.invalidateQueries({ queryKey: ["admin-all-tx"] });
      setModal(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <PageHeader title="Financeiro" description="Saldos, preços personalizados, ajustes e histórico de todos os workspaces." />

      <Card className="mb-6">
        <CardHeader><CardTitle>Workspaces</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Preço/msg</TableHead>
                <TableHead className="text-right">Mín. msgs</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((w: any) => {
                const wal = w.workspace_wallets?.[0] ?? w.workspace_wallets ?? {};
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.slug} · {w.plan}</div>
                    </TableCell>
                    <TableCell className="text-right">{fmt(wal.balance_cents)}</TableCell>
                    <TableCell className="text-right">{fmt(wal.reserved_cents)}</TableCell>
                    <TableCell className="text-right">
                      {wal.custom_price_cents != null
                        ? <Badge>{fmt(wal.custom_price_cents)}</Badge>
                        : <span className="text-muted-foreground">padrão</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {wal.custom_minimum_messages != null
                        ? <Badge variant="secondary">{Number(wal.custom_minimum_messages).toLocaleString("pt-BR")}</Badge>
                        : <span className="text-muted-foreground">padrão</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setPriceStr(wal.custom_price_cents != null ? (wal.custom_price_cents/100).toFixed(2).replace(".", ",") : ""); setModal({ ws: w, type: "price" }); }}>Preço</Button>
                      <Button size="sm" variant="outline" className="ml-2" onClick={() => { setMinMsgStr(wal.custom_minimum_messages != null ? String(wal.custom_minimum_messages) : ""); setModal({ ws: w, type: "minmsg" }); }}>Mín. msgs</Button>
                      <Button size="sm" variant="outline" className="ml-2" onClick={() => { setAmountStr(""); setDescription(""); setSignMul(1); setModal({ ws: w, type: "adjust" }); }}>Ajuste</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Últimas transações (todas as contas)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo depois</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap">{new Date(t.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{t.workspaces?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{TX_LABEL[t.type] ?? t.type}</Badge></TableCell>
                  <TableCell className="max-w-[380px] truncate">{t.description}</TableCell>
                  <TableCell className={`text-right font-medium ${t.amount_cents < 0 ? "text-destructive" : t.amount_cents > 0 ? "text-emerald-600" : ""}`}>
                    {t.amount_cents === 0 ? "—" : (t.amount_cents > 0 ? "+ " : "− ") + fmt(Math.abs(t.amount_cents))}
                  </TableCell>
                  <TableCell className="text-right">{fmt(t.balance_after_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!modal} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          {modal?.type === "price" && (
            <>
              <DialogHeader><DialogTitle>Preço personalizado — {modal.ws.name}</DialogTitle></DialogHeader>
              <div>
                <Label>R$ por mensagem (vazio = usar padrão global)</Label>
                <Input inputMode="decimal" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} placeholder="0,15" />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
                <Button onClick={() => savePrice.mutate()} disabled={savePrice.isPending}>Salvar</Button>
              </DialogFooter>
            </>
          )}
          {modal?.type === "minmsg" && (
            <>
              <DialogHeader><DialogTitle>Mínimo de mensagens — {modal.ws.name}</DialogTitle></DialogHeader>
              <div>
                <Label>Quantidade mínima (vazio = usar padrão global)</Label>
                <Input inputMode="numeric" value={minMsgStr} onChange={(e) => setMinMsgStr(e.target.value.replace(/\D/g, ""))} placeholder="2500" />
                <p className="mt-1 text-xs text-muted-foreground">
                  O depósito mínimo será o maior entre o mínimo global e (preço × mínimo de mensagens).
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
                <Button onClick={() => saveMinMsg.mutate()} disabled={saveMinMsg.isPending}>Salvar</Button>
              </DialogFooter>
            </>
          )}
          {modal?.type === "adjust" && (
            <>
              <DialogHeader><DialogTitle>Ajuste de saldo — {modal.ws.name}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button size="sm" variant={signMul === 1 ? "default" : "outline"} onClick={() => setSignMul(1)}>Adicionar</Button>
                  <Button size="sm" variant={signMul === -1 ? "default" : "outline"} onClick={() => setSignMul(-1)}>Remover</Button>
                </div>
                <div>
                  <Label>Valor (R$)</Label>
                  <Input inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="50,00" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Motivo do ajuste" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
                <Button onClick={() => saveAdjust.mutate()} disabled={saveAdjust.isPending || !description}>Confirmar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
