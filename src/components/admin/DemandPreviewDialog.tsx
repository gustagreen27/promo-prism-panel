import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, ExternalLink, Phone, Copy } from "lucide-react";
import { getDemandDetail } from "@/lib/campaign-approval.functions";

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

/** Substitui {{1}}, {{2}}… pelos valores preenchidos pelo cliente. */
export function renderTemplateBody(body: string, vars: Record<string, string> | null | undefined) {
  if (!body) return "";
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars?.[key] ?? vars?.[String(key).trim()];
    return v && String(v).trim().length ? String(v) : `{{${key}}}`;
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] break-words text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

export function DemandPreviewDialog({ campaignId, onClose }: { campaignId: string | null; onClose: () => void }) {
  const detailFn = useServerFn(getDemandDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["demand-detail", campaignId],
    enabled: !!campaignId,
    queryFn: () => detailFn({ data: { campaign_id: campaignId as string } }),
  });

  const d = data as any;
  const campaign = d?.campaign;
  const template = d?.template;
  const brief = (campaign?.custom_fields ?? {}) as Record<string, any>;
  const tplVars = (campaign?.template_variables ?? {}) as Record<string, string>;
  const varMap = (campaign?.variables_mapping ?? tplVars ?? {}) as Record<string, string>;
  const buttonMap = (campaign?.button_url_mapping ?? {}) as Record<string, string>;

  const mediaUrl: string | null =
    tplVars?.["_header_image_url"] || brief.media_url || brief.header_media_url || template?.header_media_url || null;

  const bodyRaw: string = template?.body ?? brief.message ?? "";
  const finalMessage = renderTemplateBody(bodyRaw, varMap);
  const headerText = template?.header_text ? renderTemplateBody(template.header_text, varMap) : null;

  // Foto de perfil enviada pelo cliente.
  const avatarUrl: string | null = brief.avatar_url || brief.profile_photo_url || null;

  // Botões: usa os do template quando existirem; senão o botão configurado pelo cliente.
  const tplButtons: Array<any> = Array.isArray(template?.buttons) ? template.buttons : [];
  const buttons: Array<any> =
    tplButtons.length > 0
      ? tplButtons
      : brief.button_enabled
        ? [{ type: "URL", text: brief.button_text || "Abrir link", url: brief.button_url || null }]
        : [];
  const buttonUrlOf = (b: any, i: number): string | null =>
    buttonMap[String(i)] ?? buttonMap[String(i + 1)] ?? buttonMap[b?.text] ?? b?.url ?? brief.button_url ?? null;
  const varEntries = Object.entries(varMap).filter(([k]) => !k.startsWith("_"));


  return (
    <Dialog open={!!campaignId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview da demanda {campaign?.name ? `— ${campaign.name}` : ""}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando preview…
          </p>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Falha ao carregar a demanda"}
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,340px)_1fr]">
            {/* ------- Preview estilo WhatsApp ------- */}
            <div className="rounded-2xl border bg-[#0b141a] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-white/60">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Foto de perfil definida pelo cliente"
                    className="h-8 w-8 shrink-0 rounded-full border border-white/20 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Phone className="h-3 w-3" />
                  </span>
                )}
                <span className="min-w-0 truncate">
                  {d?.connection?.label ?? "Número a definir"} · {d?.connection?.phone ?? "—"}
                </span>
              </div>
              <div className="rounded-xl bg-[#005c4b] p-2 text-white shadow-lg">
                {mediaUrl && (
                  <img
                    src={mediaUrl}
                    alt="Mídia anexada pelo cliente"
                    className="mb-2 max-h-64 w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                )}
                {headerText && <div className="mb-1 text-sm font-semibold">{headerText}</div>}
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {finalMessage || <span className="text-white/50">Sem corpo de mensagem definido</span>}
                </div>
                {template?.footer && <div className="mt-2 text-[11px] text-white/60">{template.footer}</div>}
                <div className="mt-1 text-right text-[10px] text-white/50">
                  {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              {buttons.length > 0 && (
                <div className="mt-1 space-y-1">
                  {buttons.map((b: any, i: number) => {
                    const url = buttonUrlOf(b, i);
                    return (
                      <div key={i} className="space-y-0.5">
                        <div
                          className="flex items-center justify-center gap-1 rounded-lg bg-[#1f2c33] px-3 py-2 text-xs font-medium text-[#53bdeb]"
                          title={url ?? undefined}
                        >
                          {b?.type === "URL" || url ? <ExternalLink className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {b?.text ?? b?.label ?? "Botão"}
                        </div>
                        <div className="break-all px-1 text-[10px] text-white/50">
                          {url ? `Destino: ${url}` : "Destino não informado"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            {/* ------- Detalhes da campanha ------- */}
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{campaign?.approval_status ?? "—"}</Badge>
                  <Badge variant="secondary">{campaign?.status}</Badge>
                  {brief.send_type === "test" && (
                    <Badge className="bg-sky-500/15 text-sky-600" variant="outline">Teste (máx. 10)</Badge>
                  )}
                </div>
                <Row label="Cliente" value={campaign?.workspace_name} />
                <Row label="Template" value={template ? `${template.name} · ${template.language} · ${template.status}` : "a definir"} />
                <Row label="Categoria" value={template?.category} />
                <Row label="Lista de contatos" value={d?.list?.name ?? brief.recipients_source} />
                <Row label="Destinatários válidos" value={(d?.recipients_count ?? 0).toLocaleString("pt-BR")} />
                <Row label="Filtro DDD" value={brief.ddd_filter ? `+${brief.ddd_filter}` : "Qualquer"} />
                <Row label="Criada em" value={fmt(campaign?.created_at)} />
                <Row label="Data/hora do envio" value={campaign?.scheduled_at ? fmt(campaign.scheduled_at) : "Imediato após aprovação"} />
                <Row label="Número de envio" value={d?.connection ? `${d.connection.label} (${d.connection.phone ?? "—"})` : "a definir"} />
                <Row label="BM / WABA" value={d?.connection ? `${d.connection.business_id ?? "—"} / ${d.connection.waba_id ?? "—"}` : "—"} />
                <Row label="Velocidade" value={`${campaign?.rate_per_second ?? "—"} msg/s · conc. ${campaign?.max_concurrency ?? "—"}`} />
                <Row
                  label="Foto de perfil (cliente)"
                  value={
                    avatarUrl ? (
                      <a href={avatarUrl} target="_blank" rel="noreferrer" className="underline">
                        ver imagem
                      </a>
                    ) : (
                      "não enviada"
                    )
                  }
                />
                <Row label="Texto do botão" value={buttons[0]?.text ?? "—"} />
                <Row
                  label="Destino do botão"
                  value={
                    buttons.length && buttonUrlOf(buttons[0], 0) ? (
                      <a
                        href={buttonUrlOf(buttons[0], 0) as string}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all underline"
                      >
                        {buttonUrlOf(buttons[0], 0)}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />

              </div>

              <Separator />

              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Variáveis (na ordem)</div>
                {varEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma variável preenchida.</p>
                ) : (
                  <div className="space-y-1">
                    {varEntries
                      .sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-2 rounded-md border px-2 py-1 text-xs">
                          <span className="font-mono text-muted-foreground">{`{{${k}}}`}</span>
                          <span className="break-words">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {mediaUrl && (
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                  <ExternalLink className="h-3 w-3" /> Abrir mídia em nova aba
                </a>
              )}

              {d?.sample_recipient && (
                <div className="rounded-md border p-2 text-xs">
                  <div className="mb-1 font-semibold">Exemplo de destinatário</div>
                  <div className="text-muted-foreground">{d.sample_recipient.phone}</div>
                </div>
              )}

              {brief.notes && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  <div className="mb-1 font-semibold">Observações do cliente</div>
                  {String(brief.notes)}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
