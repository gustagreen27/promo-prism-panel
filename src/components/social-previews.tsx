import { Globe, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

type Meta = {
  link_title?: string | null;
  link_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  preview_image_url?: string | null;
  favicon_url?: string | null;
};

function pick(...vals: (string | null | undefined)[]) {
  return vals.find((v) => typeof v === "string" && v.trim().length > 0) ?? null;
}

function SafeImage({
  src,
  alt,
  className,
  placeholder,
}: {
  src: string | null;
  alt: string;
  className: string;
  placeholder: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center gap-1.5 bg-muted text-xs text-muted-foreground`}>
        <ImageOff className="h-4 w-4" />
        <span>{placeholder}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function SafeFavicon({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <Globe className="h-3 w-3" />;
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-3 w-3"
    />
  );
}


export function SocialPreviews({
  meta,
  publicUrl,
}: {
  meta: Meta;
  publicUrl: string;
}) {
  const title = pick(meta.og_title, meta.link_title) ?? "Título da campanha";
  const description =
    pick(meta.og_description, meta.link_description) ??
    "Descrição que aparecerá no preview do link.";
  const image = pick(meta.og_image_url, meta.preview_image_url);
  let host = "";
  try { host = new URL(publicUrl).hostname.replace(/^www\./, ""); } catch { host = publicUrl; }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* WhatsApp */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">WhatsApp</div>
        <div className="rounded-lg bg-[#e5ddd5] p-3 dark:bg-slate-800">
          <div className="ml-auto max-w-sm rounded-lg bg-[#dcf8c6] p-1 shadow-sm dark:bg-emerald-900/60">
            <div className="overflow-hidden rounded-md bg-white dark:bg-slate-900">
              {image ? (
                <img src={image} alt="" className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  Sem imagem
                </div>
              )}
              <div className="space-y-1 p-2">
                <div className="line-clamp-2 text-sm font-semibold leading-tight">{title}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{description}</div>
                <div className="truncate text-[10px] uppercase text-muted-foreground">{host}</div>
              </div>
            </div>
            <div className="px-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">{publicUrl}</div>
          </div>
        </div>
      </div>

      {/* Facebook / LinkedIn */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Facebook / LinkedIn</div>
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          {image ? (
            <img src={image} alt="" className="aspect-[1.91/1] w-full object-cover" />
          ) : (
            <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
              Sem imagem (1200×630 recomendado)
            </div>
          )}
          <div className="space-y-1 border-t bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {meta.favicon_url ? (
                <img src={meta.favicon_url} alt="" className="h-3 w-3" />
              ) : (
                <Globe className="h-3 w-3" />
              )}
              <span className="truncate">{host}</span>
            </div>
            <div className="line-clamp-2 text-sm font-semibold leading-tight">{title}</div>
            <div className="line-clamp-2 text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RiskMeter({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Análise de intenção ainda não executada.
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, score));
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  const label = pct >= 80 ? "Baixo risco" : pct >= 50 ? "Atenção" : "Risco alto";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Medidor de risco</span>
        <span className="tabular-nums text-muted-foreground">
          {pct}/100 · {label}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
