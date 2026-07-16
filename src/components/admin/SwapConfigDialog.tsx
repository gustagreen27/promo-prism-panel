import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCcw, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WhatsAppPreview } from "@/components/campaigns/wizard/WhatsAppPreview";
import { adminListAllNumbers, adminListAllTemplates } from "@/lib/admin-dispatch.functions";
import { swapCampaignConfig } from "@/lib/wa-campaigns.functions";
import { metaVarsIn } from "@/lib/wa-variables";
import { formatPhoneDisplay } from "@/lib/phone-country";

interface SwapConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: any;
  onSuccess?: () => void;
}

export function SwapConfigDialog({ open, onOpenChange, campaign, onSuccess }: SwapConfigDialogProps) {
  const listNumbers = useServerFn(adminListAllNumbers);
  const listTemplates = useServerFn(adminListAllTemplates);
  const swap = useServerFn(swapCampaignConfig);

  const [numbers, setNumbers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [bodyVars, setBodyVars] = useState<Record<string, string>>({});
  const [btnVars, setBtnVars] = useState<Record<string, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>("");
  const [rate, setRate] = useState<number>(30);
  const [resume, setResume] = useState<boolean>(true);
  const [prevBodyVarCount, setPrevBodyVarCount] = useState<number>(0);

  // Reset when opened
  useEffect(() => {
    if (!open || !campaign) return;
    setConnectionId(campaign.connection_id ?? "");
    setTemplateId(campaign.template_id ?? "");
    const tv = (campaign.template_variables ?? campaign.variables_mapping ?? {}) as Record<string, string>;
    const bodyOnly: Record<string, string> = {};
    for (const [k, v] of Object.entries(tv)) {
      if (/^\d+$/.test(k)) bodyOnly[k] = String(v ?? "");
    }
    setBodyVars(bodyOnly);
    setPrevBodyVarCount(Object.keys(bodyOnly).length);
    setBtnVars(((campaign.button_url_mapping ?? {}) as Record<string, string>) || {});
    setHeaderMediaUrl(String(tv._header_image_url ?? ""));
    setRate(Number(campaign.send_rate_per_min ?? 30));
    setResume(true);
  }, [open, campaign]);

  // Load numbers
  useEffect(() => {
    if (!open) return;
    listNumbers({ data: {} }).then((r: any) => setNumbers(r?.numbers ?? [])).catch(() => setNumbers([]));
  }, [open, listNumbers]);

  // Load templates by connection
  useEffect(() => {
    if (!open || !connectionId) { setTemplates([]); return; }
    listTemplates({ data: { connection_id: connectionId } })
      .then((r: any) => {
        const list = r?.templates ?? [];
        setTemplates(list);
        // Clear pre-selected template if it's not active/approved (e.g. disabled by Meta)
        setTemplateId((current) => {
          if (!current) return current;
          const found = list.find((t: any) => t.id === current);
          const st = String(found?.status ?? "").toLowerCase();
          if (!found || !["approved", "aprovado", "active", "ativo"].includes(st)) return "";
          return current;
        });
      })
      .catch(() => setTemplates([]));
  }, [open, connectionId, listTemplates]);

  const selectedNumber = useMemo(() => numbers.find((n) => n.id === connectionId), [numbers, connectionId]);
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);

  const tplBodyVarNums = useMemo(
    () => (selectedTemplate ? metaVarsIn(String(selectedTemplate.body ?? "")) : []),
    [selectedTemplate],
  );
  const tplHeaderType = String(selectedTemplate?.header_type ?? "").toLowerCase();
  const tplRequiresMedia = ["image", "video", "document"].includes(tplHeaderType);
  const tplUrlButton = useMemo(() => {
    const btns = (selectedTemplate?.buttons ?? []) as any[];
    return btns.find((b) => String(b?.type ?? "").toLowerCase() === "url" && b?.url);
  }, [selectedTemplate]);
  const tplUrlVarNums = useMemo(
    () => (tplUrlButton?.url ? metaVarsIn(String(tplUrlButton.url)) : []),
    [tplUrlButton],
  );

  // Reset variable maps when template changes (keep values keyed by number)
  useEffect(() => {
    setBodyVars((prev) => {
      const next: Record<string, string> = {};
      for (const n of tplBodyVarNums) next[String(n)] = prev[String(n)] ?? "";
      return next;
    });
    setBtnVars((prev) => {
      const next: Record<string, string> = {};
      for (const n of tplUrlVarNums) next[String(n)] = prev[String(n)] ?? "";
      return next;
    });
  }, [templateId, tplBodyVarNums.join(","), tplUrlVarNums.join(",")]);

  const missing = useMemo(() => {
    const items: string[] = [];
    if (!connectionId) items.push("Selecione o número");
    if (!templateId) items.push("Selecione o template");
    if (tplRequiresMedia && !headerMediaUrl.trim()) items.push(`Informe a URL da mídia (${tplHeaderType})`);
    for (const n of tplBodyVarNums) {
      if (!(bodyVars[String(n)] ?? "").trim()) items.push(`Variável {{${n}}} do corpo`);
    }
    for (const n of tplUrlVarNums) {
      if (!(btnVars[String(n)] ?? "").trim()) items.push(`Variável {{${n}}} da URL do botão`);
    }
    if (rate < 1) items.push("Taxa (msg/min) deve ser ≥ 1");
    return items;
  }, [connectionId, templateId, tplRequiresMedia, headerMediaUrl, tplHeaderType, tplBodyVarNums, tplUrlVarNums, bodyVars, btnVars, rate]);

  const previewBody = useMemo(() => {
    const raw = String(selectedTemplate?.body ?? "");
    return raw.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => bodyVars[String(n)] || `{{${n}}}`);
  }, [selectedTemplate, bodyVars]);

  const previewButtons = useMemo(() => {
    const btns = (selectedTemplate?.buttons ?? []) as any[];
    return btns.map((b) => {
      if (String(b?.type ?? "").toLowerCase() === "url" && typeof b?.url === "string") {
        return {
          ...b,
          url: b.url.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m: string, n: string) => btnVars[n] || `{{${n}}}`),
        };
      }
      return b;
    });
  }, [selectedTemplate, btnVars]);

  const previewHeader = useMemo(() => {
    if (!selectedTemplate) return null;
    if (tplRequiresMedia) {
      return { type: selectedTemplate.header_type, media_type: tplHeaderType, media_url: headerMediaUrl || undefined };
    }
    return { type: selectedTemplate.header_type, text: selectedTemplate.header_text ?? undefined };
  }, [selectedTemplate, tplRequiresMedia, tplHeaderType, headerMediaUrl]);

  const m = useMutation({
    mutationFn: async () => {
      const tv: Record<string, string> = { ...bodyVars };
      if (headerMediaUrl.trim()) tv._header_image_url = headerMediaUrl.trim();
      return swap({
        data: {
          id: campaign.id,
          connection_id: connectionId,
          template_id: templateId,
          template_variables: tv,
          variables_mapping: bodyVars,
          button_url_mapping: btnVars,
          send_rate_per_min: rate,
          resume,
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(
        `Configuração trocada · ${r.reenqueued} reenfileirados · ${r.pending} pendentes${r.status === "running" ? " · retomando…" : ""}`,
      );
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao trocar configuração"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trocar número ou template</DialogTitle>
          <DialogDescription>
            A campanha continuará do ponto atual. Nenhum contato já enviado, entregue, lido ou com falha definitiva será reenviado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs uppercase tracking-wide">WhatsApp de envio *</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={connectionId}
                  onChange={(e) => { setConnectionId(e.target.value); setTemplateId(""); }}
                >
                  <option value="">— Selecione um número —</option>
                  {numbers.map((n) => (
                    <option key={n.id} value={n.id}>
                      {(n.phone_display ?? n.phone_masked) ?? n.display_name} — {n.display_name}
                      {n.phone_number_id ? ` · ID ${n.phone_number_id}` : ""}
                    </option>
                  ))}
                </select>
                {selectedNumber && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    <Badge variant="outline">{selectedNumber.status}</Badge>
                    {selectedNumber.quality_rating && <Badge variant="outline">Q: {selectedNumber.quality_rating}</Badge>}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide">Template *</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={!connectionId}
                >
                  <option value="">
                    {!connectionId ? "— Selecione o número primeiro —" : "— Selecione um template —"}
                  </option>
                  {templates
                    .filter((t) => ["approved", "aprovado", "active", "ativo"].includes(String(t.status ?? "").toLowerCase()))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                    ))}
                </select>
                {connectionId && templates.length === 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">Nenhum template para este número.</div>
                )}
              </div>
            </div>

            {selectedTemplate && prevBodyVarCount > 0 && tplBodyVarNums.length !== prevBodyVarCount && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Quantidade de variáveis mudou</div>
                    <div className="mt-0.5">
                      O template anterior tinha <b>{prevBodyVarCount}</b> variável(is); o novo tem <b>{tplBodyVarNums.length}</b>.
                      Refaça o mapeamento abaixo antes de salvar.
                    </div>
                  </div>
                </div>
              </div>
            )}
            {selectedTemplate && (tplRequiresMedia || tplBodyVarNums.length > 0 || tplUrlVarNums.length > 0) && (
              <div className="rounded-lg border p-3 space-y-3">
                {tplRequiresMedia && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide">URL da mídia do cabeçalho ({tplHeaderType}) *</Label>
                    <Input
                      className="mt-1"
                      placeholder="https://…"
                      value={headerMediaUrl}
                      onChange={(e) => setHeaderMediaUrl(e.target.value)}
                    />
                  </div>
                )}
                {tplBodyVarNums.length > 0 && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide">Variáveis do corpo</Label>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      {tplBodyVarNums.map((n) => (
                        <div key={`b-${n}`}>
                          <Label className="text-[11px] text-muted-foreground">{`{{${n}}}`}</Label>
                          <Input
                            value={bodyVars[String(n)] ?? ""}
                            onChange={(e) => setBodyVars((v) => ({ ...v, [String(n)]: e.target.value }))}
                            placeholder='Valor fixo ou token, ex: {nome|"Cliente"}'
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {tplUrlVarNums.length > 0 && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide">
                      Variáveis da URL do botão{tplUrlButton?.text ? ` — "${tplUrlButton.text}"` : ""}
                    </Label>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      {tplUrlVarNums.map((n) => (
                        <div key={`u-${n}`}>
                          <Label className="text-[11px] text-muted-foreground">{`{{${n}}} da URL`}</Label>
                          <Input
                            value={btnVars[String(n)] ?? ""}
                            onChange={(e) => setBtnVars((v) => ({ ...v, [String(n)]: e.target.value }))}
                            placeholder="Valor a inserir no link"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-xs uppercase tracking-wide">Velocidade do disparo</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Mensagens por minuto</Label>
                  <Input
                    type="number"
                    min={1}
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} />
              Retomar imediatamente após salvar (se houver pendentes)
            </label>

            {missing.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">Complete antes de salvar:</div>
                  <ul className="mt-1 list-disc pl-4">
                    {missing.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label className="mb-1 block text-xs">Pré-visualização</Label>
            {selectedTemplate ? (
              <WhatsAppPreview
                senderName={selectedNumber?.display_name ?? (selectedNumber?.phone_display ? formatPhoneDisplay(selectedNumber.phone_display) : "Envio")}
                header={previewHeader as any}
                body={previewBody}
                footer={selectedTemplate?.footer ?? null}
                buttons={previewButtons as any}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Selecione um template para ver a prévia.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || missing.length > 0}
          >
            {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Salvar e {resume ? "retomar" : "manter pausada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
