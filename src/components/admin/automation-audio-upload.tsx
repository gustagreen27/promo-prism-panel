import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AutomationAudioUpload({ path, onChange }: { path?: string; onChange: (path: string) => void }) {
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
    if (!/\.(mp3|ogg|aac|amr|m4a)$/i.test(file.name)) {
      toast.error("Selecione um áudio MP3, OGG, AAC, AMR ou M4A.");
      return;
    }
    if (!file.size || file.size > 16 * 1024 * 1024) {
      toast.error("O áudio deve ter conteúdo e no máximo 16 MB.");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const key = `automation-audio/${crypto.randomUUID()}.${ext}`;
      const mime: Record<string, string> = { mp3: "audio/mpeg", ogg: "audio/ogg", aac: "audio/aac", amr: "audio/amr", m4a: "audio/mp4" };
      const { error } = await supabase.storage.from("campaign-images").upload(key, file, { contentType: mime[ext ?? ""] ?? file.type, upsert: false });
      if (error) throw error;
      onChange(key);
      toast.success("Áudio carregado. Salve a automação para manter a alteração.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o áudio.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        {busy ? "Carregando…" : path ? "Trocar áudio" : "Carregar áudio"}
      </Button>
      {path && <Button type="button" variant="ghost" size="icon" title="Remover áudio" aria-label="Remover áudio" disabled={busy} onClick={() => onChange("")}><X className="h-4 w-4" /></Button>}
    </div>
    <input ref={input} type="file" aria-label="Arquivo de áudio" className="hidden" accept=".mp3,.ogg,.aac,.amr,.m4a" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
    {preview && <audio controls preload="metadata" src={preview} className="w-full min-w-0" />}
  </div>;
}