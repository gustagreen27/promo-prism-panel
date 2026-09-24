import { GRAPH_VERSION } from "@/lib/meta/graph-version";
// Server-only helpers for sending WhatsApp Cloud API messages from the ATTENDANCE module.
// Reuses the same Graph API but supports non-template payloads (text, media, interactive)
// that require an OPEN 24h service window.
// NEVER import at module scope of *.functions.ts — always dynamic import inside handlers.

const META_TIMEOUT_MS = 10000;

// Sai sempre pela porta única de egress (ver meta-egress.ts).
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = META_TIMEOUT_MS) {
  const { metaEgressFetch } = await import("@/lib/meta/meta-egress");
  return await metaEgressFetch(url, { ...init, timeoutMs });
}


export type WaServiceSendBase = {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  to: string; // E.164 sem +
  bizOpaqueCallbackData?: string | null;
  contextMessageId?: string | null; // reply/quote
};

export type WaServiceSendResult =
  | { ok: true; wamid: string; raw: any; httpStatus: number }
  | { ok: false; error: string; code?: string; raw?: any; httpStatus?: number };

function graphUrl(v: string | undefined, phoneNumberId: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

function withCommon(base: WaServiceSendBase, body: Record<string, any>) {
  const out: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: base.to,
    ...body,
  };
  if (base.contextMessageId) out.context = { message_id: base.contextMessageId };
  if (base.bizOpaqueCallbackData) out.biz_opaque_callback_data = String(base.bizOpaqueCallbackData);
  return out;
}

async function postToMeta(base: WaServiceSendBase, body: Record<string, any>): Promise<WaServiceSendResult> {
  const url = graphUrl(base.graphVersion, base.phoneNumberId);
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${base.accessToken}`,
      },
      body: JSON.stringify(withCommon(base, body)),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json?.error;
      const details = err?.error_data?.details;
      const msg = err?.message ?? `HTTP ${res.status}`;
      return {
        ok: false,
        error: details ? `${msg} — ${details}` : msg,
        code: err?.code ? String(err.code) : String(res.status),
        raw: json,
        httpStatus: res.status,
      };
    }
    const wamid = json?.messages?.[0]?.id;
    if (!wamid) return { ok: false, error: "No message id returned", raw: json, httpStatus: res.status };
    return { ok: true, wamid, raw: json, httpStatus: res.status };
  } catch (e: any) {
    const egress = e?.source === "egress";
    const timedOut = e?.name === "AbortError" || e?.code === "egress_timeout";
    return {
      ok: false,
      error: egress
        ? `Falha na saída de rede (${e.code}): ${e.message}`
        : timedOut
          ? `Meta Graph timeout ${META_TIMEOUT_MS}ms`
          : (e?.message ?? "Network error"),
      code: egress ? String(e.code ?? "egress_unavailable") : "network_error",
    };
  }

}

// ---- Public helpers ----

export function sendServiceText(base: WaServiceSendBase, body: string, previewUrl = false) {
  return postToMeta(base, { type: "text", text: { body, preview_url: previewUrl } });
}

export type WaMediaType = "image" | "video" | "audio" | "document" | "sticker";

export function sendServiceMedia(
  base: WaServiceSendBase,
  type: WaMediaType,
  opts: { link?: string; id?: string; caption?: string; filename?: string },
) {
  const media: Record<string, any> = {};
  if (opts.link) media.link = opts.link;
  if (opts.id) media.id = opts.id;
  if (opts.caption && (type === "image" || type === "video" || type === "document")) media.caption = opts.caption;
  if (opts.filename && type === "document") media.filename = opts.filename;
  return postToMeta(base, { type, [type]: media });
}

export type WaInteractiveButton = { id: string; title: string };

export function sendServiceInteractiveButtons(
  base: WaServiceSendBase,
  opts: { body: string; header?: string; footer?: string; buttons: WaInteractiveButton[] },
) {
  const body: Record<string, any> = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: opts.body },
      action: {
        buttons: opts.buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
  if (opts.header) body.interactive.header = { type: "text", text: opts.header };
  if (opts.footer) body.interactive.footer = { text: opts.footer };
  return postToMeta(base, body);
}

export type WaListRow = { id: string; title: string; description?: string };
export type WaListSection = { title: string; rows: WaListRow[] };

export function sendServiceInteractiveList(
  base: WaServiceSendBase,
  opts: { body: string; header?: string; footer?: string; button: string; sections: WaListSection[] },
) {
  const body: Record<string, any> = {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: opts.body },
      action: { button: opts.button.slice(0, 20), sections: opts.sections },
    },
  };
  if (opts.header) body.interactive.header = { type: "text", text: opts.header };
  if (opts.footer) body.interactive.footer = { text: opts.footer };
  return postToMeta(base, body);
}

export function markMessageRead(base: WaServiceSendBase, messageId: string) {
  const url = graphUrl(base.graphVersion, base.phoneNumberId);
  return fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${base.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).then((r) => r.ok);
}
