// Direct Send — formatos interativos (client-safe: usado no formulário e no servidor).
// Regras (docs oficiais do Direct Send — "Supported features and limits" e "Supported message types"):
//  - Corpo: até 1024 caracteres em qualquer formato (Direct Send segue o limite dos templates).
//  - Sem botões: mensagem de texto (type "text"), sem cabeçalho.
//  - Botão de URL: interactive "cta_url" — exatamente 1 botão (texto até 20 caracteres, URL https).
//  - Botões de resposta: interactive "button" — 1 a 3 botões (título até 20, id até 256, únicos).
//  - Botões mistos (URL + resposta): documentados pela Meta — até 10 no total, no máximo 2 de URL,
//    URL sempre antes das respostas. O JSON de exemplo fica numa página que exige login na Meta,
//    então o envio misto fica DESLIGADO (MIXED_BUTTONS_ENABLED) até termos o formato oficial.
//  - Cabeçalho (texto até 60, imagem ou vídeo) e rodapé (até 60) só existem com botões.
import { z } from "zod";

export type DirectHeaderType = "none" | "text" | "image" | "video";
export type DirectButtonsType = "none" | "url" | "reply" | "mixed";

export const BODY_MAX = 1024;
export const MIXED_MAX_TOTAL = 10;
export const MIXED_MAX_URL = 2;
/** Desligado até termos o JSON oficial do exemplo "Multiple call-to-action URL button samples". */
export const MIXED_BUTTONS_ENABLED = false;

export const IMAGE_MIME = ["image/jpeg", "image/png"] as const;
export const VIDEO_MIME = ["video/mp4", "video/3gpp"] as const;
export const IMAGE_MAX_MB = 5;
export const VIDEO_MAX_MB = 16;

export const directConfigSchema = z.object({
  header_type: z.enum(["none", "text", "image", "video"]).default("none"),
  header_text: z.string().max(60).optional().nullable(),
  media_path: z.string().max(300).optional().nullable(),
  media_mime: z.string().max(60).optional().nullable(),
  footer: z.string().max(60).optional().nullable(),
  buttons_type: z.enum(["none", "url", "reply", "mixed"]).default("none"),
  url_button: z.object({ text: z.string().max(20), url: z.string().max(2000) }).optional().nullable(),
  // Usado só no formato misto (máx. 2, sempre antes das respostas).
  url_buttons: z.array(z.object({ text: z.string().max(20), url: z.string().max(2000) })).max(MIXED_MAX_URL).optional().nullable(),
  reply_buttons: z.array(z.object({ id: z.string().max(256), title: z.string().max(20) })).max(MIXED_MAX_TOTAL).optional().nullable(),
  // Cache de upload na Meta: { [phone_number_id]: { id, uploaded_at } }
  media_ids: z.record(z.string(), z.object({ id: z.string(), uploaded_at: z.string() })).optional().nullable(),
});
export type DirectConfig = z.infer<typeof directConfigSchema>;

export function isValidHttpsUrl(u: string) {
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" && !!url.hostname && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Retorna lista de erros (vazia = válido). */
export function validateDirectConfig(text: string, cfg: DirectConfig): string[] {
  const errs: string[] = [];
  const body = text.trim();
  if (!body) errs.push("O texto da mensagem é obrigatório.");
  if (body.length > BODY_MAX) errs.push(`O texto aceita até ${BODY_MAX} caracteres no Direct Send.`);
  const interactive = cfg.buttons_type !== "none";
  if (!interactive) {
    if (cfg.header_type !== "none") errs.push("Cabeçalho só é aceito em mensagens com botões.");
    if (cfg.footer?.trim()) errs.push("Rodapé só é aceito em mensagens com botões.");
    return errs;
  }
  if (cfg.header_type === "text" && !cfg.header_text?.trim()) errs.push("Informe o texto do cabeçalho.");
  if ((cfg.header_type === "image" || cfg.header_type === "video") && !cfg.media_path) errs.push("Envie o arquivo do cabeçalho.");
  if (cfg.header_type === "image" && cfg.media_mime && !(IMAGE_MIME as readonly string[]).includes(cfg.media_mime)) errs.push("Imagem deve ser JPG ou PNG.");
  if (cfg.header_type === "video" && cfg.media_mime && !(VIDEO_MIME as readonly string[]).includes(cfg.media_mime)) errs.push("Vídeo deve ser MP4 ou 3GP.");
  if (cfg.buttons_type === "url") {
    const b = cfg.url_button;
    checkUrl(b, "Botão de URL");
  }
  function checkUrl(b: { text?: string; url?: string } | null | undefined, label: string) {
    if (!b?.text?.trim()) errs.push(`${label}: informe o texto.`);
    if (!b?.url?.trim() || !isValidHttpsUrl(b.url)) errs.push(`${label}: URL inválida (use https://…).`);
  }
  const checkReplies = (rb: { id: string; title: string }[]) => {
    rb.forEach((b, i) => {
      if (!b.title.trim()) errs.push(`Botão de resposta ${i + 1}: texto obrigatório.`);
      if (!b.id.trim()) errs.push(`Botão de resposta ${i + 1}: identificação obrigatória.`);
    });
    const ids = rb.map((b) => b.id.trim());
    if (new Set(ids).size !== ids.length) errs.push("As identificações dos botões de resposta devem ser únicas.");
  };
  if (cfg.buttons_type === "reply") {
    const rb = cfg.reply_buttons ?? [];
    if (rb.length < 1 || rb.length > 3) errs.push("Use de 1 a 3 botões de resposta.");
    checkReplies(rb);
    const titles = rb.map((b) => b.title.trim().toLowerCase());
    if (new Set(titles).size !== titles.length) errs.push("Os textos dos botões de resposta devem ser diferentes.");
  }
  if (cfg.buttons_type === "mixed") {
    const ub = cfg.url_buttons ?? [];
    const rb = cfg.reply_buttons ?? [];
    if (ub.length < 1) errs.push("A combinação precisa de pelo menos 1 botão de URL.");
    if (ub.length > MIXED_MAX_URL) errs.push(`No máximo ${MIXED_MAX_URL} botões de URL.`);
    if (rb.length < 1) errs.push("A combinação precisa de pelo menos 1 botão de resposta.");
    if (ub.length + rb.length > MIXED_MAX_TOTAL) errs.push(`No máximo ${MIXED_MAX_TOTAL} botões no total.`);
    ub.forEach((b, i) => checkUrl(b, `Botão de URL ${i + 1}`));
    checkReplies(rb);
    const titles = [...ub.map((b) => b.text), ...rb.map((b) => b.title)].map((t) => t.trim().toLowerCase());
    if (new Set(titles).size !== titles.length) errs.push("Os textos dos botões devem ser diferentes.");
    if (!MIXED_BUTTONS_ENABLED) errs.push("Envio com botões de URL e de resposta juntos ainda indisponível: aguardando o exemplo oficial da Meta.");
  }
  return errs;
}

/** Monta o corpo do POST /{phone-number-id}/messages. `mediaId` = id retornado pelo upload na Meta. */
export function buildDirectPayload(
  to: string,
  text: string,
  cfg: DirectConfig | null | undefined,
  opts: { mediaId?: string | null; bizOpaque?: string | null } = {},
) {
  const base: Record<string, any> = { messaging_product: "whatsapp", recipient_type: "individual", to };
  const c = cfg ?? ({ header_type: "none", buttons_type: "none" } as DirectConfig);
  if (c.buttons_type === "none") {
    Object.assign(base, { type: "text", text: { body: text } });
  } else {
    const interactive: Record<string, any> = { body: { text } };
    if (c.header_type === "text" && c.header_text?.trim()) interactive.header = { type: "text", text: c.header_text.trim() };
    if (c.header_type === "image" || c.header_type === "video") {
      if (!opts.mediaId) throw new Error("Mídia do cabeçalho não enviada à Meta.");
      interactive.header = { type: c.header_type, [c.header_type]: { id: opts.mediaId } };
    }
    if (c.footer?.trim()) interactive.footer = { text: c.footer.trim() };
    if (c.buttons_type === "mixed") {
      throw new Error("Formato misto (URL + resposta) desligado até termos o exemplo oficial da Meta.");
    }
    if (c.buttons_type === "url") {
      interactive.type = "cta_url";
      interactive.action = { name: "cta_url", parameters: { display_text: c.url_button!.text.trim(), url: c.url_button!.url.trim() } };
    } else {
      interactive.type = "button";
      interactive.action = {
        buttons: (c.reply_buttons ?? []).slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.trim(), title: b.title.trim() } })),
      };
    }
    Object.assign(base, { type: "interactive", interactive });
  }
  base.category = "utility";
  if (opts.bizOpaque) base.biz_opaque_callback_data = String(opts.bizOpaque);
  return base;
}

export function needsMedia(cfg: DirectConfig | null | undefined) {
  return !!cfg && cfg.buttons_type !== "none" && (cfg.header_type === "image" || cfg.header_type === "video");
}
