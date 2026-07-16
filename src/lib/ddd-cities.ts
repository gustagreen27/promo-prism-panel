// Mapeamento de DDDs brasileiros para cidade/estado principal.
// Usado para inferir a distribuição de cidades da campanha pública
// a partir dos números de telefone dos destinatários.

export const DDD_TO_CITY: Record<string, string> = {
  "11": "São Paulo - SP",
  "12": "São José dos Campos - SP",
  "13": "Santos - SP",
  "14": "Bauru - SP",
  "15": "Sorocaba - SP",
  "16": "Ribeirão Preto - SP",
  "17": "São José do Rio Preto - SP",
  "18": "Presidente Prudente - SP",
  "19": "Campinas - SP",
  "21": "Rio de Janeiro - RJ",
  "22": "Campos dos Goytacazes - RJ",
  "24": "Petrópolis - RJ",
  "27": "Vitória - ES",
  "28": "Cachoeiro de Itapemirim - ES",
  "31": "Belo Horizonte - MG",
  "32": "Juiz de Fora - MG",
  "33": "Governador Valadares - MG",
  "34": "Uberlândia - MG",
  "35": "Poços de Caldas - MG",
  "37": "Divinópolis - MG",
  "38": "Montes Claros - MG",
  "41": "Curitiba - PR",
  "42": "Ponta Grossa - PR",
  "43": "Londrina - PR",
  "44": "Maringá - PR",
  "45": "Cascavel - PR",
  "46": "Francisco Beltrão - PR",
  "47": "Joinville - SC",
  "48": "Florianópolis - SC",
  "49": "Chapecó - SC",
  "51": "Porto Alegre - RS",
  "53": "Pelotas - RS",
  "54": "Caxias do Sul - RS",
  "55": "Santa Maria - RS",
  "61": "Brasília - DF",
  "62": "Goiânia - GO",
  "63": "Palmas - TO",
  "64": "Rio Verde - GO",
  "65": "Cuiabá - MT",
  "66": "Rondonópolis - MT",
  "67": "Campo Grande - MS",
  "68": "Rio Branco - AC",
  "69": "Porto Velho - RO",
  "71": "Salvador - BA",
  "73": "Ilhéus - BA",
  "74": "Juazeiro - BA",
  "75": "Feira de Santana - BA",
  "77": "Vitória da Conquista - BA",
  "79": "Aracaju - SE",
  "81": "Recife - PE",
  "82": "Maceió - AL",
  "83": "João Pessoa - PB",
  "84": "Natal - RN",
  "85": "Fortaleza - CE",
  "86": "Teresina - PI",
  "87": "Petrolina - PE",
  "88": "Juazeiro do Norte - CE",
  "89": "Picos - PI",
  "91": "Belém - PA",
  "92": "Manaus - AM",
  "93": "Santarém - PA",
  "94": "Marabá - PA",
  "95": "Boa Vista - RR",
  "96": "Macapá - AP",
  "97": "Coari - AM",
  "98": "São Luís - MA",
  "99": "Imperatriz - MA",
};

/**
 * Extrai o DDD (dois dígitos após o código do país 55) de um número BR.
 * Aceita variações com/sem +, espaços, parênteses, etc.
 * Retorna null quando não for possível inferir um DDD brasileiro válido.
 */
export function extractDddBR(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // Remove o código do país BR se presente
  let rest = digits;
  if (rest.length >= 12 && rest.startsWith("55")) rest = rest.slice(2);
  if (rest.length < 10) return null;
  const ddd = rest.slice(0, 2);
  if (!DDD_TO_CITY[ddd]) return null;
  return ddd;
}

export type DddCityRow = { label: string; count: number };

/** Constrói a lista de cidades a partir da contagem por DDD. */
export function citiesFromDddCounts(
  counts: Record<string, number>,
  limit = 12,
): DddCityRow[] {
  const rows: DddCityRow[] = [];
  for (const [ddd, count] of Object.entries(counts)) {
    const label = DDD_TO_CITY[ddd];
    if (!label || count <= 0) continue;
    rows.push({ label, count });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, limit);
}
