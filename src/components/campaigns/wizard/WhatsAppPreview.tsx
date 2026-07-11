import { Image as ImageIcon, FileText, Video, ExternalLink, Phone } from "lucide-react";

export type PreviewButton = { type?: string; text: string; url?: string; phone_number?: string };
export type WhatsAppPreviewProps = {
  header?: { type?: string; text?: string; media_type?: string; media_url?: string } | null;
  body: string;
  footer?: string | null;
  buttons?: PreviewButton[];
  senderName?: string;
  timeLabel?: string;
};

/** Renderiza uma bolha realista de mensagem no estilo WhatsApp. */
export function WhatsAppPreview({
  header,
  body,
  footer,
  buttons = [],
  senderName = "Seu negócio",
  timeLabel,
}: WhatsAppPreviewProps) {
  const time = timeLabel ?? new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const headerMediaType = header?.media_type?.toLowerCase();
  const showMediaPlaceholder = header?.type?.toLowerCase() === "image" || headerMediaType === "image"
    || header?.type?.toLowerCase() === "video" || headerMediaType === "video"
    || header?.type?.toLowerCase() === "document" || headerMediaType === "document";

  return (
    <div className="rounded-xl border bg-[#e5ddd5] p-4 shadow-inner dark:bg-neutral-800">
      <div className="mx-auto max-w-sm space-y-2">
        <div className="text-center text-[10px] text-neutral-500">hoje</div>
        <div className="relative rounded-lg bg-white p-2 shadow-sm dark:bg-neutral-700">
          <div className="mb-1 text-[11px] font-semibold text-primary">{senderName}</div>

          {header?.type?.toLowerCase() === "image" || headerMediaType === "image" ? (
            <div className="mb-2 flex aspect-video w-full items-center justify-center rounded bg-neutral-200 text-neutral-500 dark:bg-neutral-600">
              {header?.media_url
                ? <img src={header.media_url} alt="" className="h-full w-full rounded object-cover" />
                : <ImageIcon className="h-8 w-8" />}
            </div>
          ) : header?.type?.toLowerCase() === "video" || headerMediaType === "video" ? (
            <div className="mb-2 flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-neutral-200 text-neutral-500 dark:bg-neutral-600">
              {header?.media_url
                ? <video src={header.media_url} controls className="h-full w-full object-cover" />
                : <Video className="h-8 w-8" />}
            </div>
          ) : header?.type?.toLowerCase() === "document" || headerMediaType === "document" ? (
            <div className="mb-2 flex items-center gap-2 rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-600">
              <FileText className="h-5 w-5 text-neutral-500" />
              {header?.media_url
                ? <a href={header.media_url} target="_blank" rel="noreferrer" className="truncate text-primary underline">Abrir documento</a>
                : "Documento anexado"}
            </div>
          ) : header?.text ? (
            <div className="mb-1 text-sm font-bold text-neutral-900 dark:text-neutral-100">{header.text}</div>
          ) : null}

          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-900 dark:text-neutral-100">
            {body || <span className="italic text-neutral-400">O corpo da mensagem aparecerá aqui.</span>}
          </div>

          {footer && (
            <div className="mt-2 text-[11px] text-neutral-500">{footer}</div>
          )}

          <div className="mt-1 text-right text-[10px] text-neutral-400">{time} ✓✓</div>

          {buttons.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-600">
              {buttons.map((b, i) => {
                const t = (b.type ?? "").toLowerCase();
                const Icon = t.includes("url") ? ExternalLink : t.includes("phone") ? Phone : null;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center gap-1.5 rounded bg-white/70 p-1.5 text-xs font-medium text-primary dark:bg-neutral-800"
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />} {b.text || "Botão"}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
