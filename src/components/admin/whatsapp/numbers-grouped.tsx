import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2, ChevronDown, ChevronRight, MessageCircle, Users,
  AlertTriangle, Pencil, Trash2, KeyRound, UserCog, Phone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = {
  rows: any[];
  wabas: any[];
  businesses?: { business_id: string; name: string | null }[];
  onEdit: (r: any) => void;
  onCreds: (r: any) => void;
  onDelete: (id: string) => void;
};

const QUALITY_LABEL: Record<string, string> = {
  GREEN: "Alta", YELLOW: "Média", RED: "Baixa",
  HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa",
};

function qualityClass(q?: string | null) {
  const k = (q ?? "").toUpperCase();
  if (k === "GREEN" || k === "HIGH") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (k === "YELLOW" || k === "MEDIUM") return "border-amber-500/30 bg-amber-500/10 text-amber-600";
  if (k === "RED" || k === "LOW") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function qualityLabel(q?: string | null) {
  const k = (q ?? "").toUpperCase();
  return QUALITY_LABEL[k] ?? (q || "—");
}

function isCritical(r: any) {
  const q = (r.quality_rating ?? "").toUpperCase();
  return q === "RED" || q === "LOW" || r.status === "erro";
}

function StatCard({ icon: Icon, value, label, tone }: any) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tone ?? "bg-primary/10 text-primary"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function NumbersGrouped({ rows, wabas, onEdit, onCreds, onDelete }: Props) {
  const [openBm, setOpenBm] = useState<Record<string, boolean>>({});
  const [openWaba, setOpenWaba] = useState<Record<string, boolean>>({});

  const wabaByExternalId = useMemo(() => {
    const m = new Map<string, any>();
    for (const w of wabas ?? []) if (w.waba_id) m.set(String(w.waba_id), w);
    return m;
  }, [wabas]);

  const portfolios = useMemo(() => {
    const bms = new Map<string, { id: string; name: string; wabas: Map<string, { id: string; name: string; numbers: any[] }> }>();

    const push = (bmId: string, bmName: string, wabaId: string, wabaName: string, num: any | null) => {
      if (!bms.has(bmId)) bms.set(bmId, { id: bmId, name: bmName, wabas: new Map() });
      const bm = bms.get(bmId)!;
      if (!bm.wabas.has(wabaId)) bm.wabas.set(wabaId, { id: wabaId, name: wabaName, numbers: [] });
      if (num) bm.wabas.get(wabaId)!.numbers.push(num);
    };

    for (const w of wabas ?? []) {
      const bmId = String(w.business_id ?? "sem-bm");
      push(bmId, bmId === "sem-bm" ? "Sem portfólio" : `BM ${bmId}`, String(w.waba_id ?? w.id), w.nome_interno ?? `WABA ${w.waba_id ?? ""}`, null);
    }

    for (const r of rows ?? []) {
      const wabaExt = String(r.waba_id ?? "sem-waba");
      const ref = wabaByExternalId.get(wabaExt);
      const bmId = String(r.business_id ?? ref?.business_id ?? "sem-bm");
      push(
        bmId,
        bmId === "sem-bm" ? "Sem portfólio" : `BM ${bmId}`,
        wabaExt,
        ref?.nome_interno ?? (wabaExt === "sem-waba" ? "Sem WABA" : `WABA ${wabaExt}`),
        r,
      );
    }

    return Array.from(bms.values())
      .map((bm) => ({ ...bm, wabaList: Array.from(bm.wabas.values()) }))
      .sort((a, b) => {
        const na = a.wabaList.reduce((s, w) => s + w.numbers.length, 0);
        const nb = b.wabaList.reduce((s, w) => s + w.numbers.length, 0);
        return nb - na;
      });
  }, [rows, wabas, wabaByExternalId]);

  const totals = useMemo(() => ({
    portfolios: portfolios.length,
    wabas: portfolios.reduce((s, b) => s + b.wabaList.length, 0),
    numbers: (rows ?? []).length,
    critical: (rows ?? []).filter(isCritical).length,
  }), [portfolios, rows]);

  const avgQuality = (nums: any[]) => {
    const score: number[] = nums.map((n) => (n.quality_rating ?? "").toUpperCase())
      .map((q): number => (q === "GREEN" || q === "HIGH" ? 3 : q === "YELLOW" || q === "MEDIUM" ? 2 : q === "RED" || q === "LOW" ? 1 : 0))
      .filter((v: number) => v > 0);
    if (!score.length) return null;
    const avg = score.reduce((a: number, b: number) => a + b, 0) / score.length;
    return avg >= 2.5 ? "GREEN" : avg >= 1.5 ? "YELLOW" : "RED";
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} value={totals.portfolios} label="Portfólios" />
        <StatCard icon={Users} value={totals.wabas} label="WABAs" />
        <StatCard icon={MessageCircle} value={totals.numbers} label="Números" tone="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={AlertTriangle} value={totals.critical} label="números críticos" tone="bg-destructive/10 text-destructive" />
      </div>

      <div className="space-y-3">
        {portfolios.map((bm) => {
          const numbersCount = bm.wabaList.reduce((s, w) => s + w.numbers.length, 0);
          const expanded = openBm[bm.id] ?? false;
          return (
            <div key={bm.id} className="rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => setOpenBm((s) => ({ ...s, [bm.id]: !expanded }))}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{bm.name}</span>
                    {numbersCount > 0 && <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">Ativa</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">BM ID: {bm.id}</div>
                </div>
                <div className="hidden items-center gap-6 text-sm sm:flex">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span><b>{bm.wabaList.length}</b> <span className="text-xs text-muted-foreground">WABAs</span></span></div>
                  <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-muted-foreground" /><span><b>{numbersCount}</b> <span className="text-xs text-muted-foreground">Números</span></span></div>
                </div>
              </button>

              {expanded && (
                <div className="space-y-3 border-t p-3">
                  {bm.wabaList.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">Nenhuma WABA neste portfólio.</p>
                  )}
                  {bm.wabaList.map((w) => {
                    const key = `${bm.id}:${w.id}`;
                    const wOpen = openWaba[key] ?? false;
                    const q = avgQuality(w.numbers);
                    return (
                      <div key={key} className="rounded-lg border bg-background">
                        <button
                          type="button"
                          onClick={() => setOpenWaba((s) => ({ ...s, [key]: !wOpen }))}
                          className="flex w-full items-center gap-3 p-3 text-left"
                        >
                          {wOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                            <MessageCircle className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{w.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">ID: {w.id}</div>
                          </div>
                          <div className="hidden items-center gap-6 sm:flex">
                            <div className="text-sm"><b>{w.numbers.length}</b> <span className="text-xs text-muted-foreground">Números</span></div>
                            <div className="text-right">
                              <Badge variant="outline" className={qualityClass(q)}>{qualityLabel(q)}</Badge>
                              <div className="text-[11px] text-muted-foreground">Qualidade média</div>
                            </div>
                          </div>
                        </button>

                        {wOpen && (
                          <div className="border-t">
                            {w.numbers.length === 0 ? (
                              <p className="p-4 text-sm text-muted-foreground">Nenhum número nesta WABA.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Número / Nome</TableHead>
                                    <TableHead>Telefone</TableHead>
                                    <TableHead>Phone Number ID</TableHead>
                                    <TableHead>Qualidade</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Cliente / Projeto</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {w.numbers.map((r: any) => (
                                    <TableRow key={r.id}>
                                      <TableCell className="font-medium">{r.name}</TableCell>
                                      <TableCell>
                                        <span className="flex items-center gap-2 font-mono text-xs">
                                          <Phone className="h-3.5 w-3.5 text-emerald-600" />
                                          {r.display_phone ?? r.phone ?? "—"}
                                        </span>
                                      </TableCell>
                                      <TableCell className="font-mono text-xs">{r.phone_number_id ?? "—"}</TableCell>
                                      <TableCell><Badge variant="outline" className={qualityClass(r.quality_rating)}>{qualityLabel(r.quality_rating)}</Badge></TableCell>
                                      <TableCell>
                                        <Badge variant={r.status === "ativa" ? "default" : r.status === "erro" ? "destructive" : "secondary"}>{r.status}</Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">{[r.client?.name, r.project?.name].filter(Boolean).join(" · ") || "—"}</TableCell>
                                      <TableCell className="text-right whitespace-nowrap">
                                        <Button asChild size="icon" variant="ghost" title="Gerenciar perfil">
                                          <Link to="/admin/whatsapp/numeros/$id/perfil" params={{ id: r.id }}><UserCog className="h-4 w-4" /></Link>
                                        </Button>
                                        <Button size="icon" variant="ghost" title="Trocar credenciais Meta" onClick={() => onCreds(r)}><KeyRound className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" title="Editar" onClick={() => onEdit(r)}><Pencil className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" title="Remover" onClick={() => confirm("Remover este número?") && onDelete(r.id)}><Trash2 className="h-4 w-4" /></Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
