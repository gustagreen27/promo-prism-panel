import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AutomationVideoUpload({ path, onChange }: { path?: string; onChange: (path: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    let active = true;
    setPreview("");
    if (path) void supabase.storage.from("campaign-images").createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setPreview(data?.signedUrl ?? "");
    });
    return () => { active = false; };
  }, [path]);

  async function upload(file: File) {
    if (!/\.(mp4|3gp)$/i.test(file.name)) {
      toast.error("Selecione um vídeo MP4 ou 3GP.");
      return;
    }
    if (!file.size || file.size > 16 * 1024 * 1024) {
      toast.error("O vídeo deve ter conteúdo e no máximo 16 MB.");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const key = `automation-video/${crypto.randomUUID()}.${ext}`;
      const mime: Record<string, string> = { mp4: "video/mp4", "3gp": "video/3gpp" };
      const { error } = await supabase.storage.from("campaign-images").upload(key, file, { contentType: mime[ext ?? ""] ?? file.type, upsert: false });
      if (error) throw error;
      onChange(key);
      toast.success("Vídeo carregado. Salve a automação para manter a alteração.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o vídeo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        {busy ? "Carregando…" : path ? "Trocar vídeo" : "Carregar vídeo"}
      </Button>
      {path && <Button type="button" variant="ghost" size="icon" title="Remover vídeo" aria-label="Remover vídeo" disabled={busy} onClick={() => onChange("")}><X className="h-4 w-4" /></Button>}
    </div>
    <input ref={input} type="file" aria-label="Arquivo de vídeo" className="hidden" accept=".mp4,.3gp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
    {preview && <video controls preload="metadata" src={preview} className="w-full min-w-0 rounded-md" />}
  </div>;
}
