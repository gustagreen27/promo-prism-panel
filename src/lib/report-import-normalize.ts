// Normaliza o JSON exportado da plataforma de disparo (formato bruto com lead aninhado)
// para o formato plano usado pelos relatórios importados.

export type NormalizedRecord = {
  boostItemId: string | null;
  boostId: string | null;
  leadId: string | null;
  status: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string | null;
  enteredAt: string | null;
  startedAt: string | null;
  statusChangedAt: string | null;
  whatsappInstanceId: string | null;
  isPending: boolean | null;
  lastSentMessageId: string | null;
  lastSentAt: string | null;
  lastSentErrorCode: string | null;
  lastReceivedMessageId: string | null;
  lastReceivedAt: string | null;
  lastReceivedErrorCode: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  messageStatus: string | null;
};

const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null;

export function normalizeRecord(r: any): NormalizedRecord {
  const lead = r?.lead ?? {};
  const contacts: any[] = Array.isArray(lead?.contacts) ? lead.contacts : [];
  const wa = contacts.find((c) => String(c?.platform).toUpperCase() === "WHATSAPP");
  const st = wa?.lastContactStatus ?? {};
  const sent = st?.lastSendedMessage ?? st?.lastSentMessage ?? {};
  const recv = st?.lastReceivedMessage ?? {};
  const email = contacts.find((c) => String(c?.platform).toUpperCase() === "EMAIL");

  return {
    boostItemId: s(r?.boostItemId ?? r?.id),
    boostId: s(r?.boostId),
    leadId: s(r?.leadId ?? lead?.id),
    status: s(r?.status),
    name: s(r?.name ?? lead?.name),
    phone: s(r?.phone ?? lead?.phone ?? lead?.rawPhone ?? wa?.contactId),
    email: s(r?.email ?? lead?.email ?? email?.contactId),
    createdAt: s(r?.createdAt),
    enteredAt: s(r?.enteredAt),
    startedAt: s(r?.startedAt),
    statusChangedAt: s(r?.statusChangedAt ?? r?.finishedAt),
    whatsappInstanceId: s(r?.whatsappInstanceId ?? st?.instanceId ?? wa?.instanceId),
    isPending: typeof r?.isPending === "boolean" ? r.isPending : typeof st?.isPending === "boolean" ? st.isPending : null,
    lastSentMessageId: s(r?.lastSentMessageId ?? sent?.messageId),
    lastSentAt: s(r?.lastSentAt ?? sent?.date),
    lastSentErrorCode: s(r?.lastSentErrorCode ?? sent?.errorCode),
    lastReceivedMessageId: s(r?.lastReceivedMessageId ?? recv?.messageId),
    lastReceivedAt: s(r?.lastReceivedAt ?? recv?.date),
    lastReceivedErrorCode: s(r?.lastReceivedErrorCode ?? recv?.errorCode),
    errorCode: s(r?.errorCode),
    errorMessage: s(r?.errorMessage),
    messageStatus: s(r?.messageStatus),
  };
}

export function normalizeRecords(raw: any[]): NormalizedRecord[] {
  return raw.map(normalizeRecord);
}

export function summarizeRecords(records: NormalizedRecord[]) {
  let firstStartedAt: string | null = null;
  let firstSentAt: string | null = null;
  let lastSentAt: string | null = null;
  let completed = 0;
  let errors = 0;

  for (const r of records) {
    if (r.status === "completed") completed++;
    else if (r.status === "error") errors++;
    if (r.startedAt && (!firstStartedAt || r.startedAt < firstStartedAt)) firstStartedAt = r.startedAt;
    if (r.lastSentAt) {
      if (!firstSentAt || r.lastSentAt < firstSentAt) firstSentAt = r.lastSentAt;
      if (!lastSentAt || r.lastSentAt > lastSentAt) lastSentAt = r.lastSentAt;
    }
  }

  const total = records.length;
  return {
    total,
    completed,
    errors,
    completionRate: total ? (completed / total) * 100 : 0,
    errorRate: total ? (errors / total) * 100 : 0,
    firstStartedAt,
    firstSentAt,
    lastSentAt,
  };
}
