// Server-only client for the sending.lat WhatsApp API.
// Never import at module scope of a client-reachable file.

const BASE = "https://sending.lat/WhatsApp";
const TIMEOUT_MS = 90000;
const RETRIES = 2;

export type SendingLatResponse = Record<string, any>;

async function post(endpoint: string, payload: Record<string, any>): Promise<SendingLatResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Resposta inválida da API (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    if (!res.ok) {
      throw new Error(json?.message ?? `HTTP ${res.status}`);
    }
    return json;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`Timeout de ${TIMEOUT_MS}ms ao chamar sending.lat`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function checkCredits(apiKey: string) {
  return post("api_check_credits.php", { api_key: apiKey });
}

export function getReports(apiKey: string, startDate?: string, endDate?: string) {
  const payload: Record<string, any> = { api_key: apiKey };
  if (startDate) payload.start_date = startDate;
  if (endDate) payload.end_date = endDate;
  return post("api_get_reports.php", payload);
}

export function getReportDetails(apiKey: string, campaignId: string | number) {
  return post("api_get_report_details.php", { api_key: apiKey, campaign_id: campaignId });
}

export function getMediaPaths(apiKey: string, campaignId: string | number) {
  return post("api_get_media_paths.php", { api_key: apiKey, campaign_id: campaignId });
}

export type SendCampaignInput = {
  nome_campanha: string;
  mensagem: string;
  numeros_manuais?: string;
  base_contatos_id?: string;
  tipo_midia?: "imagem" | "video" | "nenhum";
  midia_url?: string;
  foto_perfil_url?: string;
  nome_perfil?: string;
  biografia?: string;
  nome_btn1?: string;
  link_btn1?: string;
  nome_btn2?: string;
  link_btn2?: string;
  nome_btn_rapida?: string;
  agendar_envio?: 0 | 1;
  data_agendamento?: string;
  hora_agendamento?: string;
};

export function sendCampaign(apiKey: string, input: SendCampaignInput) {
  const payload: Record<string, any> = { api_key: apiKey };
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && v !== "") payload[k] = v;
  }
  return post("api_send_campaign.php", payload);
}
