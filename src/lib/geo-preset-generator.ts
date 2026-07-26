// Gerador de presets geográficos aleatórios para a página pública.
// Camada de apresentação: apenas monta listas de país/cidade com percentuais.

export type GeoItem = { label: string; percent: string; country: string };

const BRAZIL_CITIES = [
  "São Paulo", "Rio de Janeiro", "Belo Horizonte", "Salvador", "Brasília",
  "Fortaleza", "Curitiba", "Manaus", "Recife", "Porto Alegre", "Goiânia",
  "Belém", "Campinas", "São Luís", "Maceió", "Natal", "Teresina",
  "Campo Grande", "João Pessoa", "Cuiabá", "Aracaju", "Florianópolis",
  "Londrina", "Juiz de Fora", "Ribeirão Preto", "Sorocaba", "Uberlândia",
  "Niterói", "Santos", "Joinville", "Feira de Santana", "Caxias do Sul",
  "Vitória", "Anápolis", "Bauru", "Piracicaba", "Blumenau", "Petrolina",
  "Marabá", "Palmas", "Macapá", "Boa Vista", "Rio Branco", "Porto Velho",
  "Caruaru", "Imperatriz", "Governador Valadares", "Mossoró", "Itabuna",
  "Chapecó", "Criciúma", "Foz do Iguaçu", "Maringá", "Franca", "Jundiaí",
];

const OTHER_COUNTRIES: { country: string; cities: string[] }[] = [
  { country: "Portugal", cities: ["Lisboa", "Porto", "Braga", "Coimbra", "Faro"] },
  { country: "Estados Unidos", cities: ["Miami", "Orlando", "Boston", "Newark", "Atlanta"] },
  { country: "Argentina", cities: ["Buenos Aires", "Córdoba", "Rosário", "Mendoza"] },
  { country: "Paraguai", cities: ["Assunção", "Ciudad del Este", "Encarnación"] },
  { country: "Uruguai", cities: ["Montevidéu", "Punta del Este", "Salto"] },
  { country: "Espanha", cities: ["Madri", "Barcelona", "Valência"] },
  { country: "Japão", cities: ["Tóquio", "Nagoia", "Hamamatsu"] },
  { country: "Chile", cities: ["Santiago", "Valparaíso"] },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Distribui `total`% entre `n` itens com pesos aleatórios decrescentes. */
function randomWeights(n: number, total: number, min = 0.4): number[] {
  if (n <= 0) return [];
  const raw = Array.from({ length: n }, (_, i) => rand(0.5, 1.5) / (i * 0.35 + 1));
  const sum = raw.reduce((s, v) => s + v, 0);
  const vals = raw.map((v) => Math.max(min, (v / sum) * total));
  // normaliza de volta para o total
  const s2 = vals.reduce((s, v) => s + v, 0);
  const norm = vals.map((v) => Number(((v / s2) * total).toFixed(1)));
  // ajuste de arredondamento no maior item
  const diff = Number((total - norm.reduce((s, v) => s + v, 0)).toFixed(1));
  if (norm.length) norm[0] = Number((norm[0] + diff).toFixed(1));
  return norm;
}

export function generateBrazilPreset(opts?: {
  cities?: number;
  foreignCountries?: number;
}): { countries: GeoItem[]; cities: GeoItem[] } {
  const cityCount = opts?.cities ?? Math.round(rand(16, 24));
  const foreignCount = opts?.foreignCountries ?? Math.round(rand(3, 5));

  const brasilPct = Number(rand(88, 95).toFixed(1));
  const foreign = shuffle(OTHER_COUNTRIES).slice(0, foreignCount);
  const foreignPcts = randomWeights(foreign.length, Number((100 - brasilPct).toFixed(1)), 0.3);

  const countries: GeoItem[] = [
    { label: "Brasil", percent: String(brasilPct), country: "" },
    ...foreign.map((f, i) => ({ label: f.country, percent: String(foreignPcts[i] ?? 0.5), country: "" })),
  ];

  // cidades brasileiras: mistura as grandes com médias aleatórias
  const brCities = shuffle(BRAZIL_CITIES).slice(0, Math.max(6, cityCount - foreign.length));
  const brPcts = randomWeights(brCities.length, brasilPct);
  const cities: GeoItem[] = brCities.map((label, i) => ({
    label,
    percent: String(brPcts[i] ?? 0.5),
    country: "Brasil",
  }));

  foreign.forEach((f, i) => {
    const pick = shuffle(f.cities).slice(0, Math.random() > 0.5 ? 2 : 1);
    const pcts = randomWeights(pick.length, foreignPcts[i] ?? 0.5, 0.2);
    pick.forEach((label, j) =>
      cities.push({ label, percent: String(pcts[j] ?? 0.2), country: f.country }),
    );
  });

  return { countries, cities: shuffle(cities) };
}

/** Intercala (embaralha) a ordem e redistribui levemente os percentuais existentes. */
export function shuffleGeoList(list: GeoItem[], jitter = 0.25): GeoItem[] {
  if (list.length === 0) return list;
  const total = list.reduce((s, it) => s + (Number(it.percent) || 0), 0);
  const shuffled = shuffle(list);
  const weights = shuffled.map(
    (it) => Math.max(0.05, (Number(it.percent) || 0.5) * rand(1 - jitter, 1 + jitter)),
  );
  const ws = weights.reduce((s, v) => s + v, 0);
  return shuffled.map((it, i) => ({
    ...it,
    percent: String(Number(((weights[i] / ws) * total).toFixed(1))),
  }));
}
