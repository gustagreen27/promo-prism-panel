import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { analyzeTracking, type AuditResult } from "@/lib/tracking-audit.functions";

export const Route = createFileRoute("/_authenticated/admin/auditoria-rastreamento")({
  head: () => ({ meta: [{ title: "Auditoria de rastreamento — Painel" }] }),
  component: Page,
});

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400000 - 3 * 3600000);
  return d.toISOString().slice(0, 10);
};
const sevVariant = { alta: "destructive", media: "default", baixa: "secondary" } as const;

function Page() {
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState(day(-7));
  const [to, setTo] = useState(day(0));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const run = useServerFn(analyzeTracking);

  const { data: campaigns = [] } = useQuery({
    queryKey: ["audit-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("id, name, slug").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function analyze() {
    if (!campaignId) return toast.error("Escolha uma campanha.");
    if (from > to) return toast.error("A data inicial é depois da final.");
    setLoading(true);
    setResult(null);
    try {
      const r = await run({
        data: {
          campaignId,
          from: new Date(`${from}T00:00:00-03:00`).toISOString(),
          to: new Date(`${to}T23:59:59-03:00`).toISOString(),
        },
      });
      setResult(r as AuditResult);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise.");
    } finally {
      setLoading(false);
    }
  }

  const s = result?.stats as Record<string, any> | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Auditoria de rastreamento" description="A IA analisa os acessos de uma página pública e aponta possíveis falhas na contagem" />
      <Card className="grid gap-4 p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label>Campanha</Label>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} — /{c.slug}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button onClick={analyze} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Analisar
        </Button>
      </Card>

      {result && s && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Cliques", s.cliques_total],
              ["Únicos (por IP)", s.ips_unicos],
              ["Sem IP / sem local", `${s.sem_ip} / ${s.sem_geolocalizacao}`],
              ["Robôs suspeitos", s.bots_por_user_agent],
            ].map(([l, v]) => (
              <Card key={l as string} className="p-4">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="text-2xl font-semibold">{v as string}</div>
              </Card>
            ))}
          </div>
          <Card className="space-y-2 p-4">
            <h3 className="font-semibold">Resumo</h3>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{result.summary || "Sem resumo."}</p>
            {result.truncated && <p className="text-xs text-muted-foreground">Período muito grande: analisados os primeiros 20 mil cliques.</p>}
          </Card>
          <div className="space-y-3">
            {result.findings.length === 0 && <Card className="p-4 text-sm text-muted-foreground">Nenhuma falha apontada.</Card>}
            {result.findings.map((f, i) => (
              <Card key={i} className="space-y-1.5 p-4">
                <div className="flex items-center gap-2">
                  <Badge variant={sevVariant[f.severity] ?? "secondary"}>{f.severity}</Badge>
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{f.detail}</p>
                <p className="text-sm"><span className="font-medium">Sugestão:</span> {f.suggestion}</p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">A análise é feita por IA a partir dos números acima e pode errar; confirme antes de agir.</p>
        </>
      )}
    </div>
  );
}
