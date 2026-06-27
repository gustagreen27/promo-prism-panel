// Server-only helper for sending official WhatsApp Cloud API messages.
// Never import this from a route or *.functions.ts module scope.
// Always: const { sendTemplateMessage } = await import("@/lib/wa-send.server");

export type WaSendInput = {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  to: string; // E.164 without +
  templateName: string;
  languageCode: string;
  variables?: Record<string, string>; // {{1}}, {{2}} -> by name "1","2"
  headerType?: string | null;
  headerValue?: string | null; // image/document url or text
};

export type WaSendResult =
  | { ok: true; metaMessageId: string; raw: any }
  | { ok: false; error: string; code?: string; raw?: any };

function buildBodyComponents(variables?: Record<string, string>) {
  if (!variables) return [];
  const keys = Object.keys(variables).sort((a, b) => Number(a) - Number(b));
  if (!keys.length) return [];
  return [
    {
      type: "body",
      parameters: keys.map((k) => ({ type: "text", text: String(variables[k] ?? "") })),
    },
  ];
}

function buildHeaderComponent(headerType?: string | null, value?: string | null) {
  if (!headerType || !value) return [];
  const t = headerType.toLowerCase();
  if (t === "text") {
    return [{ type: "header", parameters: [{ type: "text", text: value }] }];
  }
  if (t === "image") return [{ type: "header", parameters: [{ type: "image", image: { link: value } }] }];
  if (t === "video") return [{ type: "header", parameters: [{ type: "video", video: { link: value } }] }];
  if (t === "document")
    return [{ type: "header", parameters: [{ type: "document", document: { link: value } }] }];
  return [];
}

export async function sendTemplateMessage(input: WaSendInput): Promise<WaSendResult> {
  const ver = input.graphVersion || "v21.0";
  const url = `https://graph.facebook.com/${ver}/${input.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: [
        ...buildHeaderComponent(input.headerType, input.headerValue),
        ...buildBodyComponents(input.variables),
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json?.error;
      return {
        ok: false,
        error: err?.message ?? `HTTP ${res.status}`,
        code: err?.code ? String(err.code) : String(res.status),
        raw: json,
      };
    }
    const id = json?.messages?.[0]?.id;
    if (!id) return { ok: false, error: "No message id returned", raw: json };
    return { ok: true, metaMessageId: id, raw: json };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

export async function syncTemplatesFromMeta(opts: {
  wabaId: string;
  accessToken: string;
  graphVersion?: string;
}) {
  const ver = opts.graphVersion || "v21.0";
  const url = `https://graph.facebook.com/${ver}/${opts.wabaId}/message_templates?limit=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${opts.accessToken}` } });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return (json?.data ?? []) as any[];
}
