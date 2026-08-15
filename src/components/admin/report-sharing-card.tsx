import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Pencil } from "lucide-react";
import { slugify, isValidSlug, publicReportUrl } from "@/lib/slugify";
import { checkReportSlug, updateReportSharing } from "@/lib/imported-reports.functions";

export function ReportSharingCard({
  reportId,
  name,
  publicSlug,
  isPublic,
  onChanged,
}: {
  reportId: string;
  name?: string | null;
  publicSlug: string | null;
  isPublic: boolean;
  onChanged?: () => void;
}) {
  const updateFn = useServerFn(updateReportSharing);
  const checkFn = useServerFn(checkReportSlug);

  const [editing, setEditing] = useState(!publicSlug);
  const [slug, setSlug] = useState(publicSlug ?? slugify(name ?? ""));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSlug(publicSlug ?? slugify(name ?? ""));
    setEditing(!publicSlug);
  }, [publicSlug, name]);

  const url = publicSlug ? publicReportUrl(publicSlug) : "";

  const saveSlug = async () => {
    if (!isValidSlug(slug)) {
      toast.error("Slug inválido", { description: "Use apenas letras minúsculas, números e hífens." });
      return;
    }
    setSaving(true);
    try {
      const check = await checkFn({ data: { slug, excludeId: reportId } });
      if (!check.available) {
        toast.error("Slug indisponível", { description: "Este slug já está em uso por outro relatório." });
        return;
      }
      await updateFn({ data: { id: reportId, publicSlug: slug } });
      toast.success("Slug atualizado.");
      setEditing(false);
      onChanged?.();
    } catch (e: any) {
      toast.error("Não foi possível salvar", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const togglePublic = async (value: boolean) => {
    setSaving(true);
    try {
      await updateFn({ data: { id: reportId, isPublic: value, ...(value && !publicSlug ? { publicSlug: slug } : {}) } });
      toast.success(value ? "Link público ativado." : "Link público desativado.");
      onChanged?.();
    } catch (e: any) {
      toast.error("Não foi possível alterar", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-4 space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Compartilhamento</h3>
          <Badge variant={isPublic && publicSlug ? "default" : "secondary"}>
            {isPublic && publicSlug ? "Público" : "Desativado"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="sharing-toggle" className="text-xs font-normal text-muted-foreground">Relatório público</Label>
          <Switch
            id="sharing-toggle"
            checked={!!isPublic && !!publicSlug}
            disabled={saving || (!publicSlug && !isValidSlug(slug))}
            onCheckedChange={togglePublic}
          />
        </div>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <Label htmlFor="sharing-slug">Slug público</Label>
            <Input
              id="sharing-slug"
              className="mt-1"
              value={slug}
              placeholder="magistrar-1408"
              onChange={(e) => setSlug(slugify(e.target.value))}
            />
            <p className="mt-1 break-all text-xs text-muted-foreground">{publicReportUrl(slug || "seu-slug")}</p>
          </div>
          <Button size="sm" disabled={saving || !isValidSlug(slug)} onClick={saveSlug}>Salvar slug</Button>
          {publicSlug && (
            <Button size="sm" variant="outline" onClick={() => { setSlug(publicSlug); setEditing(false); }}>Cancelar</Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border bg-muted/40 px-2 py-1 text-xs break-all">{url}</code>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copiado."); }}>
            <Copy className="size-4" /> Copiar link
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir relatório público</a>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Editar slug
          </Button>
          {isPublic && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={saving} onClick={() => togglePublic(false)}>
              Desativar link
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
