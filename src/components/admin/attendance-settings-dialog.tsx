import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAttendanceSettings,
  updateAttendanceSettings,
} from "@/lib/wa-attendance-settings.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Rule = {
  pattern: string;
  tags: string[];
  assign_to?: string | null;
};

const ALL_ROLES = ["owner", "admin", "operator", "viewer"] as const;

export function AttendanceSettingsDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const getFn = useServerFn(getAttendanceSettings);
  const saveFn = useServerFn(updateAttendanceSettings);

  const query = useQuery({
    queryKey: ["attendance-settings"],
    queryFn: () => getFn({ data: {} }),
    enabled: open,
  });

  const settings = query.data?.settings;
  const agents = query.data?.agents ?? [];
  const canEdit = query.data?.can_edit ?? false;

  const [rr, setRr] = useState(false);
  const [sla, setSla] = useState(15);
  const [notifyNew, setNotifyNew] = useState(true);
  const [notifySla, setNotifySla] = useState(true);
  const [roles, setRoles] = useState<string[]>(["owner", "admin", "operator"]);
  const [rules, setRules] = useState<Rule[]>([]);

  useEffect(() => {
    if (!settings) return;
    setRr(!!settings.round_robin_enabled);
    setSla(Number(settings.sla_first_response_minutes ?? 15));
    setNotifyNew(!!settings.notify_on_new_conversation);
    setNotifySla(!!settings.notify_on_sla_breach);
    setRoles(Array.isArray(settings.agent_roles) ? settings.agent_roles : []);
    setRules(Array.isArray(settings.keyword_rules) ? settings.keyword_rules : []);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["attendance-settings"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const disabled = !canEdit || saveMut.isPending;

  const agentOptions = useMemo(
    () =>
      agents.map((a: any) => ({
        value: a.user_id,
        label: a.name || a.email || a.user_id.slice(0, 8),
      })),
    [agents],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          <Settings2 className="h-4 w-4" /> Automação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automação & SLA do Atendimento</DialogTitle>
          <DialogDescription>
            Rodízio, SLA de primeira resposta e regras por palavra-chave.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Round robin */}
            <section className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Auto-atribuição por rodízio</div>
                  <div className="text-xs text-muted-foreground">
                    Distribui conversas novas para o atendente com menor uso recente.
                  </div>
                </div>
                <Switch checked={rr} onCheckedChange={setRr} disabled={disabled} />
              </div>
              <div>
                <Label className="text-xs">Papéis elegíveis</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => {
                    const active = roles.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setRoles((prev) =>
                            active ? prev.filter((x) => x !== r) : [...prev, r],
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background"
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* SLA */}
            <section className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">SLA de primeira resposta</div>
                  <div className="text-xs text-muted-foreground">
                    Tempo máximo (min) para o primeiro retorno do atendente.
                  </div>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={sla}
                    disabled={disabled}
                    onChange={(e) => setSla(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label className="text-sm">Notificar quando chegar nova conversa</Label>
                <Switch
                  checked={notifyNew}
                  onCheckedChange={setNotifyNew}
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Notificar quando SLA estourar</Label>
                <Switch
                  checked={notifySla}
                  onCheckedChange={setNotifySla}
                  disabled={disabled}
                />
              </div>
            </section>

            {/* Keyword rules */}
            <section className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Regras por palavra-chave</div>
                  <div className="text-xs text-muted-foreground">
                    Ao receber uma mensagem que combine com o padrão (regex),
                    aplica tags e atribuição direcionada.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || rules.length >= 50}
                  onClick={() =>
                    setRules((prev) => [...prev, { pattern: "", tags: [], assign_to: null }])
                  }
                >
                  <Plus className="h-4 w-4" /> Regra
                </Button>
              </div>

              {rules.length === 0 && (
                <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Nenhuma regra. Ex.: padrão <code>cancelar</code> → tag <em>churn</em>.
                </div>
              )}

              <div className="space-y-2">
                {rules.map((r, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded border p-2 md:grid-cols-[1fr_1fr_180px_auto]">
                    <div>
                      <Label className="text-xs">Padrão (regex, case-insensitive)</Label>
                      <Input
                        value={r.pattern}
                        disabled={disabled}
                        onChange={(e) =>
                          setRules((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)),
                          )
                        }
                        placeholder="ex.: cancelar|cancelamento"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tags (separadas por vírgula)</Label>
                      <Input
                        value={r.tags.join(", ")}
                        disabled={disabled}
                        onChange={(e) =>
                          setRules((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    tags: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                      .slice(0, 10),
                                  }
                                : x,
                            ),
                          )
                        }
                        placeholder="churn, urgente"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Atribuir para</Label>
                      <Select
                        value={r.assign_to ?? "__none"}
                        onValueChange={(v) =>
                          setRules((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, assign_to: v === "__none" ? null : v } : x,
                            ),
                          )
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— ninguém —</SelectItem>
                          {agentOptions.map((a: { value: string; label: string }) => (
                            <SelectItem key={a.value} value={a.value}>
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() =>
                          setRules((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label="Remover regra"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {!canEdit && (
              <Badge variant="secondary">
                Somente owner/admin podem editar. Você tem acesso de leitura.
              </Badge>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          <Button
            disabled={disabled}
            onClick={() =>
              saveMut.mutate({
                round_robin_enabled: rr,
                agent_roles: roles,
                sla_first_response_minutes: sla,
                keyword_rules: rules
                  .filter((r) => r.pattern.trim())
                  .map((r) => ({
                    pattern: r.pattern.trim(),
                    tags: r.tags,
                    assign_to: r.assign_to || null,
                  })),
                notify_on_new_conversation: notifyNew,
                notify_on_sla_breach: notifySla,
              })
            }
          >
            {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
