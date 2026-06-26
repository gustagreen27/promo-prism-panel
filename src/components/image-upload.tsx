import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ImageOff, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  value: string | null | undefined;
  onChange: (url: string) => void;
  /** Storage subfolder, e.g. "preview", "og", "favicon" */
  folder?: string;
  /** Accept attribute for the file input */
  accept?: string;
  /** Max file size in MB */
  maxMb?: number;
  /** Shape of the preview thumb */
  shape?: "square" | "rect";
};

function proxyUrl(path: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/public/ci/${path}`;
}

export function ImageUpload({
  value,
  onChange,
  folder = "misc",
  accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon",
  maxMb = 4,
  shape = "rect",
}: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Arquivo maior que ${maxMb}MB`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const key = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("campaign-images")
        .upload(key, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange(proxyUrl(key));
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e?.message || "Falha no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div
          className={
            "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted " +
            (shape === "square" ? "h-16 w-16" : "h-16 w-28")
          }
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Enviar imagem
                </>
              )}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Remover
              </Button>
            ) : null}
          </div>
          <Input
            type="url"
            placeholder="ou cole uma URL https://…"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
