import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { claimSharedWabaFn } from "@/lib/wa-claim-shared.functions";

type Props = { variant?: "default" | "outline" | "secondary"; label?: string };

export function ClaimSharedWabaDialog({ variant = "outline", label = "Vincular conta compartilhada" }: Props) {
  const [open, setOpen] = useState(false);
  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [nome, setNome] = useState("");
  const qc = useQueryClient();
  const claim = useServerFn(claimSharedWabaFn);

  const mut = useMutation({
    mutationFn: () =>
      claim({
        data: {
          waba_id: wabaId.trim(),
          access_token: token.trim() || null,
          nome_interno: nome.trim() || null,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`WABA vinculada: ${r?.waba_name ?? r?.waba_id} — ${r?.numbers ?? 0} número(s).`);
      for (const key of ["wa-workspace-conns", "wa-wabas", "wa-numeros"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      setOpen(false);
      setWabaId("");
      setToken("");
      setNome("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao vincular a WABA."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant}>
          <Link2 className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular conta compartilhada</DialogTitle>
          <DialogDescription>
            Depois que o cliente compartilha a conta pelo link oficial da Meta, a Meta não avisa o sistema
            automaticamente. Informe o WABA ID para importar a conta, os números e ativar os webhooks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="claim-waba">WABA ID</Label>
            <Input
              id="claim-waba"
              inputMode="numeric"
              placeholder="1007888915415085"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claim-name">Nome interno (opcional)</Label>
            <Input
              id="claim-name"
              placeholder="PSB Pagamentos Seguros Brasil"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claim-token">Token de usuário do sistema (opcional)</Label>
            <Input
              id="claim-token"
              type="password"
              placeholder="EAA..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se a leitura falhar sem token, gere um token de usuário do sistema na sua BM com acesso a esta WABA.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => mut.mutate()} disabled={mut.isPending || wabaId.trim().length < 8}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
