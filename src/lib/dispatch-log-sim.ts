/**
 * Geração determinística de logs de envio (nível mensagem) para demandas
 * executadas externamente, onde não existem linhas reais em campaign_recipients.
 *
 * A distribuição respeita exatamente os totais finais informados (enviadas,
 * entregues, lidas, respostas e falhas) e os horários configurados de início e
 * finalização — a mesma campanha sempre produz os mesmos wamid e timestamps.
 */

export type SimLogStatus = 'delivered' | 'read' | 'replied' | 'sent' | 'failed'

export type SimLogRow = {
  phone: string
  status: SimLogStatus
  wamid: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  replied_at: string | null
  failed_at: string | null
  error_code: string | null
  error_reason: string | null
}

export type SimTotals = {
  sent: number
  delivered: number
  read: number
  replied: number
  failed: number
}

function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return h >>> 0
}

function frac(seed: string): number {
  return (hash(seed) % 1000000) / 1000000
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** wamid no formato usado pela Meta Cloud API: wamid.HBgN<base64>== */
export function simulateWamid(campaignId: string, phone: string, index: number): string {
  let out = ''
  let h = hash(`${campaignId}:${phone}:${index}`)
  for (let i = 0; i < 28; i++) {
    h = (Math.imul(h, 1103515245) + 12345 + i) >>> 0
    out += B64[h % B64.length]
  }
  const digits = phone.replace(/\D/g, '').slice(-13).padStart(13, '5')
  return `wamid.HBgN${digits}FQIAERgS${out}==`
}

const FAILURE_REASONS: Array<{ code: string; reason: string; weight: number }> = [
  { code: '131026', reason: 'Destinatário indisponível para receber a mensagem', weight: 0.52 },
  { code: '131052', reason: 'Número inválido ou sem WhatsApp ativo', weight: 0.29 },
  { code: '470', reason: 'Não foi possível concluir a entrega no prazo', weight: 0.12 },
  { code: '131047', reason: 'Janela de atendimento expirada', weight: 0.07 },
]

function pickFailure(seed: string) {
  const r = frac(seed)
  let acc = 0
  for (const f of FAILURE_REASONS) {
    acc += f.weight
    if (r <= acc) return f
  }
  return FAILURE_REASONS[FAILURE_REASONS.length - 1]!
}

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * Constrói os logs simulados a partir da lista de telefones da demanda.
 * `phones` pode ser uma amostra: as proporções dos totais são preservadas.
 */
export function buildSimulatedLogs(params: {
  campaignId: string
  phones: string[]
  totals: SimTotals
  startMs: number
  finishMs: number
}): SimLogRow[] {
  const { campaignId, phones, startMs } = params
  const finishMs = Math.max(params.finishMs, startMs + 60_000)
  const n = phones.length
  if (n === 0) return []

  const t = params.totals
  const processed = Math.max(1, t.sent + t.failed)
  const scale = (v: number) => Math.round((Math.max(0, v) / processed) * n)

  const failed = Math.min(n, scale(t.failed))
  const sentTotal = n - failed
  const delivered = Math.min(sentTotal, scale(t.delivered))
  const read = Math.min(delivered, Math.round((Math.max(0, t.read) / Math.max(1, t.delivered || 1)) * delivered))
  const replied = Math.min(read, Math.round((Math.max(0, t.replied) / Math.max(1, t.read || 1)) * read))

  // Ordem determinística e "embaralhada" por hash: define quem cai em cada faixa.
  const ranked = phones
    .map((phone, i) => ({ phone, i, k: hash(`${campaignId}:rank:${phone}:${i}`) }))
    .sort((a, b) => a.k - b.k)

  const span = finishMs - startMs
  const rows: SimLogRow[] = ranked.map((entry, rank) => {
    const { phone, i } = entry
    const sentAt = startMs + Math.floor(frac(`${campaignId}:t:${phone}:${i}`) * span)
    const isFailed = rank < failed
    if (isFailed) {
      const f = pickFailure(`${campaignId}:err:${phone}`)
      return {
        phone,
        status: 'failed',
        wamid: null,
        sent_at: null,
        delivered_at: null,
        read_at: null,
        replied_at: null,
        failed_at: iso(sentAt),
        error_code: f.code,
        error_reason: f.reason,
      }
    }

    const offset = rank - failed
    const isDelivered = offset < delivered
    const isRead = offset < read
    const isReplied = offset < replied

    const deliveredAt = isDelivered ? sentAt + 2_000 + Math.floor(frac(`${campaignId}:d:${phone}`) * 45_000) : null
    const readAt =
      isRead && deliveredAt ? deliveredAt + 30_000 + Math.floor(frac(`${campaignId}:r:${phone}`) * 3_600_000) : null
    const repliedAt =
      isReplied && readAt ? readAt + 20_000 + Math.floor(frac(`${campaignId}:p:${phone}`) * 1_800_000) : null

    return {
      phone,
      status: isReplied ? 'replied' : isRead ? 'read' : isDelivered ? 'delivered' : 'sent',
      wamid: simulateWamid(campaignId, phone, i),
      sent_at: iso(sentAt),
      delivered_at: deliveredAt ? iso(deliveredAt) : null,
      read_at: readAt ? iso(readAt) : null,
      replied_at: repliedAt ? iso(repliedAt) : null,
      failed_at: null,
      error_code: null,
      error_reason: null,
    }
  })

  return rows.sort((a, b) => {
    const ta = a.sent_at ?? a.failed_at ?? ''
    const tb = b.sent_at ?? b.failed_at ?? ''
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })
}

/**
 * Percorre os logs simulados em ordem cronológica chamando `cb` linha a linha,
 * sem reter os objetos em memória — usado na exportação de bases grandes
 * (centenas de milhares de contatos). Produz exatamente os mesmos status,
 * wamid e timestamps de buildSimulatedLogs.
 */
export function eachSimulatedLog(
  params: { campaignId: string; phones: string[]; totals: SimTotals; startMs: number; finishMs: number },
  cb: (row: SimLogRow) => void,
): void {
  const { campaignId, phones, startMs } = params
  const finishMs = Math.max(params.finishMs, startMs + 60_000)
  const n = phones.length
  if (n === 0) return

  const t = params.totals
  const processed = Math.max(1, t.sent + t.failed)
  const scale = (v: number) => Math.round((Math.max(0, v) / processed) * n)

  const failed = Math.min(n, scale(t.failed))
  const sentTotal = n - failed
  const delivered = Math.min(sentTotal, scale(t.delivered))
  const read = Math.min(delivered, Math.round((Math.max(0, t.read) / Math.max(1, t.delivered || 1)) * delivered))
  const replied = Math.min(read, Math.round((Math.max(0, t.replied) / Math.max(1, t.read || 1)) * read))

  const rankKey = new Uint32Array(n)
  const timeKey = new Uint32Array(n)
  const byIndex: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const phone = phones[i]!
    rankKey[i] = hash(`${campaignId}:rank:${phone}:${i}`)
    timeKey[i] = hash(`${campaignId}:t:${phone}:${i}`)
    byIndex[i] = i
  }

  const byRank = byIndex.slice().sort((a, b) => rankKey[a]! - rankKey[b]! || a - b)
  const rankOf = new Uint32Array(n)
  for (let r = 0; r < n; r++) rankOf[byRank[r]!] = r

  const byTime = byIndex.sort((a, b) => timeKey[a]! - timeKey[b]! || a - b)

  const span = finishMs - startMs
  for (const i of byTime) {
    const phone = phones[i]!
    const rank = rankOf[i]!
    const sentAt = startMs + Math.floor(((timeKey[i]! % 1000000) / 1000000) * span)
    if (rank < failed) {
      const f = pickFailure(`${campaignId}:err:${phone}`)
      cb({
        phone,
        status: 'failed',
        wamid: null,
        sent_at: null,
        delivered_at: null,
        read_at: null,
        replied_at: null,
        failed_at: iso(sentAt),
        error_code: f.code,
        error_reason: f.reason,
      })
      continue
    }

    const offset = rank - failed
    const isDelivered = offset < delivered
    const isRead = offset < read
    const isReplied = offset < replied

    const deliveredAt = isDelivered ? sentAt + 2_000 + Math.floor(frac(`${campaignId}:d:${phone}`) * 45_000) : null
    const readAt =
      isRead && deliveredAt ? deliveredAt + 30_000 + Math.floor(frac(`${campaignId}:r:${phone}`) * 3_600_000) : null
    const repliedAt =
      isReplied && readAt ? readAt + 20_000 + Math.floor(frac(`${campaignId}:p:${phone}`) * 1_800_000) : null

    cb({
      phone,
      status: isReplied ? 'replied' : isRead ? 'read' : isDelivered ? 'delivered' : 'sent',
      wamid: simulateWamid(campaignId, phone, i),
      sent_at: iso(sentAt),
      delivered_at: deliveredAt ? iso(deliveredAt) : null,
      read_at: readAt ? iso(readAt) : null,
      replied_at: repliedAt ? iso(repliedAt) : null,
      failed_at: null,
      error_code: null,
      error_reason: null,
    })
  }
}

/** Mascara o telefone para exibição ao cliente: +55 62 9****-**38 */
export function maskPhone(phone: string): string {
  const d = String(phone).replace(/\D/g, '')
  if (d.length < 8) return phone
  const cc = d.slice(0, 2)
  const ddd = d.slice(2, 4)
  const rest = d.slice(4)
  const tail = rest.slice(-2)
  return `+${cc} ${ddd} ${rest.slice(0, 1)}${'*'.repeat(Math.max(0, rest.length - 3))}${tail}`
}
