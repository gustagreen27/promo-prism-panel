import { useState } from "react";
import { Plus, Trash2, Bell, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <Label className="mb-1.5 flex items-center gap-1 text-xs font-medium">
      {children}
      {optional && <span className="font-normal text-muted-foreground">· Opcional</span>}
    </Label>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className="text-[11px] tabular-nums text-muted-foreground">{(value ?? "").length}/{max}</span>;
}

/** Meta-style live preview bubble */
function TemplatePreview({ form }: { form: any }) {
  const buttons: any[] = Array.isArray(form.buttons) ? form.buttons : [];
  const inline = buttons.slice(0, 3);
  const overflow = buttons.length > 3;
  return (
    <aside className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Prévia do modelo</h3>
      </div>
      <div className="p-4">
        <div className="rounded-md bg-muted/60 p-4">
          <div className="max-w-[280px] rounded-lg bg-background p-2.5 shadow-sm">
            {form.header_type === "text" && form.header_text && (
              <p className="mb-1 text-sm font-semibold">{form.header_text}</p>
            )}
            {form.header_type && form.header_type !== "text" && (
              <div className="mb-2 flex h-24 items-center justify-center rounded bg-muted text-[11px] uppercase text-muted-foreground">
                {form.header_type}
              </div>
            )}
            <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
              {form.body?.trim() ? form.body : "Hello"}
            </p>
            {form.footer && <p className="mt-1 text-[11px] text-muted-foreground">{form.footer}</p>}
            <div className="mt-1 text-right text-[10px] text-muted-foreground">07:34</div>
            {inline.length > 0 && (
              <div className="mt-2 space-y-1 border-t pt-2">
                {inline.map((b, i) => (
                  <div key={i} className="rounded py-1 text-center text-[13px] font-medium text-primary">
                    {b.text || (b.type === "COPY_CODE" ? "Copiar código" : "Botão")}
                  </div>
                ))}
                {overflow && <div className="rounded py-1 text-center text-[13px] font-medium text-primary">Ver todas as opções</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function TemplateFormDialog({ editing, numbers, wabas, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    connection_id: "", waba_ref_id: "", name: "", language: "pt_BR", category: "MARKETING",
    status: "pending", header_type: "", header_text: "", header_media_url: "", body: "", footer: "",
    variables: [], variables_examples: [], buttons: [], ttl_enabled: false,
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setBtn = (i: number, patch: any) => {
    const arr = [...(form.buttons ?? [])]; arr[i] = { ...arr[i], ...patch }; set("buttons", arr);
  };
  const bodyExamples = (Array.isArray(form.variables_examples) ? form.variables_examples : []).find((e: any) => e?.section === "body")?.values ?? [];
  const setBodyExamples = (arr: string[]) => {
    const others = (Array.isArray(form.variables_examples) ? form.variables_examples : []).filter((e: any) => e?.section !== "body");
    set("variables_examples", [...others, { section: "body", values: arr }]);
  };
  const detected = ((form.body || "").match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g) || []);

  return (
    <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto p-0 gap-0">
      {/* Top bar — Meta style */}
      <DialogHeader className="sticky top-0 z-10 flex-row items-center gap-3 space-y-0 border-b bg-card px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <DialogTitle className="truncate text-base">
            {form.name || "your_template_name"} · {form.language || "pt_BR"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {CATEGORY_LABEL[form.category] ?? form.category} · {editing ? "Edição" : "Padrão"}
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="grid gap-4 bg-muted/30 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Section title="Conta e número">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>WABA *</FieldLabel>
                <Select value={form.waba_ref_id ?? ""} onValueChange={(v) => set("waba_ref_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a WABA" /></SelectTrigger>
                  <SelectContent>{wabas.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.nome_interno}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel optional>Número</FieldLabel>
                <Select value={form.connection_id ?? ""} onValueChange={(v) => set("connection_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{numbers.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section title="Nome e idioma do modelo">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <FieldLabel>Dê um nome ao seu modelo</FieldLabel>
                <div className="relative">
                  <Input maxLength={512} className="pr-16" placeholder="insira_um_nome_para_o_modelo"
                    value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2"><Counter value={form.name} max={512} /></span>
                </div>
              </div>
              <div>
                <FieldLabel>Selecione o idioma</FieldLabel>
                <Select value={form.language ?? "pt_BR"} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["pt_BR", "en", "en_US", "es", "es_ES"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Categoria</FieldLabel>
                <Select value={form.category ?? ""} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["approved", "pending", "rejected", "paused", "disabled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section
            title="Conteúdo"
            description="Adicione um cabeçalho, corpo de texto e rodapé ao seu modelo. A API de Nuvem hospedada pela Meta vai analisar as variáveis e o conteúdo do modelo para proteger a segurança e a integridade dos nossos serviços."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel>Tipo de variável</FieldLabel>
                <Select value={form.variable_format ?? "positional"} onValueChange={(v) => set("variable_format", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positional">Número</SelectItem>
                    <SelectItem value="named">Nomeada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Amostra de mídia</FieldLabel>
                <Select value={form.header_type || "none"} onValueChange={(v) => set("header_type", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel optional>URL da amostra de mídia</FieldLabel>
                <Input placeholder="https://exemplo.com/midia.jpg" value={form.header_media_url ?? ""}
                  onChange={(e) => set("header_media_url", e.target.value)} disabled={!form.header_type || form.header_type === "text"} />
              </div>
            </div>

            <div>
              <FieldLabel optional>Cabeçalho</FieldLabel>
              <div className="relative">
                <Input maxLength={60} className="pr-16" placeholder="Adicione uma pequena linha de texto ao cabeçalho da sua mensagem"
                  value={form.header_text ?? ""} onChange={(e) => set("header_text", e.target.value)}
                  disabled={form.header_type !== "text"} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2"><Counter value={form.header_text} max={60} /></span>
              </div>
            </div>

            <div>
              <FieldLabel>Corpo</FieldLabel>
              <div className="relative">
                <Textarea rows={8} maxLength={1024} className="resize-y pr-16"
                  placeholder={"Olá {{1}}, sua mensagem..."}
                  value={form.body ?? ""} onChange={(e) => set("body", e.target.value)} />
                <span className="absolute right-3 top-2"><Counter value={form.body} max={1024} /></span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Variáveis detectadas:</span>
                  {detected.length === 0
                    ? <span className="text-xs text-muted-foreground">—</span>
                    : detected.map((d: string, i: number) => <Badge key={i} variant="secondary" className="font-mono text-[10px]">{d}</Badge>)}
                </div>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => {
                    const next = (form.variable_format ?? "positional") === "named"
                      ? `{{variavel_${detected.length + 1}}}`
                      : `{{${detected.length + 1}}}`;
                    set("body", `${form.body ?? ""}${next}`);
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />Adicionar variável
                </Button>
              </div>
              <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Aceita posicionais (<span className="font-mono">{"{{1}}"}</span>) ou nomeadas (<span className="font-mono">{"{{nome_cliente}}"}</span>, minúsculas e underscore).
              </p>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-semibold">Amostras de variável</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Adicione um exemplo para cada variável. As amostras são usadas apenas na revisão da Meta — não serão enviadas ao cliente. Não inclua dados pessoais.
              </p>
              <p className="mt-3 text-[11px] font-medium text-muted-foreground">Corpo</p>
              <div className="mt-1.5 space-y-1.5">
                {detected.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma variável no corpo.</p>}
                {detected.map((d: string, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 rounded border bg-background px-2 py-1.5 font-mono text-[11px] text-muted-foreground">{d}</span>
                    <Input
                      className="bg-background" placeholder="Exemplo de conteúdo"
                      value={bodyExamples[i] ?? ""}
                      onChange={(e) => {
                        const arr = [...bodyExamples];
                        while (arr.length < detected.length) arr.push("");
                        arr[i] = e.target.value;
                        setBodyExamples(arr.slice(0, detected.length));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel optional>Rodapé</FieldLabel>
              <div className="relative">
                <Input maxLength={60} className="pr-16" placeholder="Adicione uma pequena linha de texto à parte inferior da sua mensagem"
                  value={form.footer ?? ""} onChange={(e) => set("footer", e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2"><Counter value={form.footer} max={60} /></span>
              </div>
            </div>
          </Section>


          <Section
            title="Botões · Opcional"
            description="Crie botões que permitam que os clientes respondam à sua mensagem ou realizem uma ação. É possível adicionar até 10 botões. Se você adicionar mais de 3 botões, eles aparecerão em uma lista."
          >
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={(form.buttons ?? []).length >= 10}
                onClick={() => set("buttons", [...(form.buttons ?? []), { type: "URL", text: "", url: "", url_type: "static" }])}>
                <Plus className="mr-1 h-3.5 w-3.5" />Chamada para ação
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={(form.buttons ?? []).length >= 10}
                onClick={() => set("buttons", [...(form.buttons ?? []), { type: "QUICK_REPLY", text: "" }])}>
                <Plus className="mr-1 h-3.5 w-3.5" />Resposta rápida
              </Button>
            </div>

            {[
              { label: "Chamada para ação · Opcional", types: ["URL", "PHONE_NUMBER", "COPY_CODE", "VOICE_CALL"] },
              { label: "Resposta rápida · Opcional", types: ["QUICK_REPLY"] },
            ].map((group) => {
              const items = (form.buttons ?? [])
                .map((b: any, i: number) => ({ b, i }))
                .filter(({ b }: any) => group.types.includes(b.type));
              if (items.length === 0) return null;
              return (
                <div key={group.label} className="rounded-md border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold">{group.label}</p>
                  <div className="space-y-2">
                    {items.map(({ b, i }: any) => (
                      <div key={i} className="space-y-2 rounded-md border bg-background p-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <FieldLabel>Tipo de ação</FieldLabel>
                            <Select value={b.type} onValueChange={(v) => setBtn(i, { type: v })}>
                              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="QUICK_REPLY">Resposta rápida</SelectItem>
                                <SelectItem value="URL">Acessar o site</SelectItem>
                                <SelectItem value="PHONE_NUMBER">Ligar para o número</SelectItem>
                                <SelectItem value="COPY_CODE">Copiar código</SelectItem>
                                <SelectItem value="VOICE_CALL">Solicitar ligação</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {b.type !== "COPY_CODE" && (
                            <div className="min-w-[180px] flex-1">
                              <FieldLabel>Texto do botão</FieldLabel>
                              <div className="relative">
                                <Input maxLength={25} className="pr-14" placeholder="Falar com atendente" value={b.text ?? ""}
                                  onChange={(e) => setBtn(i, { text: e.target.value })} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2"><Counter value={b.text} max={25} /></span>
                              </div>
                            </div>
                          )}
                          {b.type === "URL" && (
                            <div>
                              <FieldLabel>Tipo de URL</FieldLabel>
                              <Select value={b.url_type ?? "static"} onValueChange={(v) => setBtn(i, { url_type: v })}>
                                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="static">Estático</SelectItem>
                                  <SelectItem value="dynamic">Dinâmico</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <Button type="button" size="icon" variant="ghost" className="ml-auto"
                            onClick={() => { const arr = [...form.buttons]; arr.splice(i, 1); set("buttons", arr); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {b.type === "URL" && (
                          <>
                            <div>
                              <FieldLabel>URL do site</FieldLabel>
                              <Input placeholder={b.url_type === "dynamic" ? "https://exemplo.com/{{1}}" : "https://exemplo.com/"}
                                value={b.url ?? ""} onChange={(e) => setBtn(i, { url: e.target.value })} />
                            </div>
                            {b.url_type === "dynamic" && (
                              <div className="rounded-md bg-muted/40 p-2.5">
                                <p className="text-[11px] font-medium">Adicionar URL da amostra</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Para nos ajudar a analisar seu modelo de mensagem, adicione um exemplo da URL. Não use informações de clientes reais.
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="w-16 shrink-0 rounded border bg-background px-2 py-1.5 text-center font-mono text-[11px] text-muted-foreground">{"{{1}}"}</span>
                                  <Input className="bg-background" placeholder="https://exemplo.com/abc123" value={b.example ?? ""}
                                    onChange={(e) => setBtn(i, { example: e.target.value })} />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {b.type === "PHONE_NUMBER" && (
                          <div>
                            <FieldLabel>Número de telefone</FieldLabel>
                            <Input placeholder="+5511999999999" value={b.phone_number ?? ""}
                              onChange={(e) => setBtn(i, { phone_number: e.target.value })} />
                          </div>
                        )}
                        {b.type === "COPY_CODE" && (
                          <div>
                            <FieldLabel>Código de exemplo</FieldLabel>
                            <Input placeholder="Ex.: 250FF" value={b.example ?? ""}
                              onChange={(e) => setBtn(i, { example: e.target.value })} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Section>


          <Section
            title="Período de validade da mensagem"
            description="Você pode definir um período de validade personalizado para entregar sua mensagem antes que ela expire. Se a mensagem não for entregue dentro desse período, você não receberá a cobrança e seu cliente não vai vê-la."
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Definir um período de validade personalizado</p>
                <p className="text-xs text-muted-foreground">Se não definido, o período padrão do WhatsApp será aplicado.</p>
              </div>
              <Switch checked={!!form.ttl_enabled} onCheckedChange={(v) => set("ttl_enabled", v)} />
            </div>
            {form.ttl_enabled && (
              <div className="w-48">
                <FieldLabel>Validade (segundos)</FieldLabel>
                <Input type="number" min={30} value={form.ttl_seconds ?? 600}
                  onChange={(e) => set("ttl_seconds", Number(e.target.value))} />
              </div>
            )}
          </Section>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <TemplatePreview form={form} />
        </div>
      </div>

      <DialogFooter className="sticky bottom-0 flex-row items-center justify-between gap-2 border-t bg-card px-5 py-3 sm:justify-between">
        <DialogClose asChild>
          <Button variant="outline" type="button">Descartar</Button>
        </DialogClose>
        <Button disabled={saving || !form.name || !form.body} onClick={() => onSubmit(form)}>
          {saving ? "Salvando…" : editing ? "Salvar alterações" : "Enviar para análise"}
        </Button>
      </DialogFooter>

    </DialogContent>
  );
}
