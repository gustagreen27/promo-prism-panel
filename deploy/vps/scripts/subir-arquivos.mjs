// Sobe os arquivos baixados (fotos, áudios, vídeos) para o armazenamento do
// seu servidor de dados, mantendo os mesmos caminhos.
// Estrutura esperada:  deploy/vps/arquivos/<pasta>/<caminho do arquivo>
//   ex.: deploy/vps/arquivos/campaign-images/automation-audio/abc.mp3
// Uso (na VPS, com Node 22):
//   SUPABASE_URL=https://api.aagencianext.com SUPABASE_SERVICE_ROLE_KEY=... \
//     node deploy/vps/scripts/subir-arquivos.mjs
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";

const URL_BASE = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ROOT = new URL("../arquivos/", import.meta.url).pathname;
if (!URL_BASE || !KEY) { console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".3gp": "video/3gpp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".aac": "audio/aac",
  ".m4a": "audio/mp4", ".amr": "audio/amr", ".pdf": "application/pdf" };
const auth = { Authorization: `Bearer ${KEY}`, apikey: KEY };

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

let ok = 0, fail = 0;
for (const bucket of await readdir(ROOT)) {
  if (!(await stat(join(ROOT, bucket))).isDirectory()) continue;
  await fetch(`${URL_BASE}/storage/v1/bucket`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: false }),
  }).catch(() => {}); // já existe = tudo bem
  for await (const file of walk(join(ROOT, bucket))) {
    const path = relative(join(ROOT, bucket), file).split("\\").join("/");
    const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
      method: "POST",
      headers: { ...auth, "x-upsert": "true", "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" },
      body: await readFile(file),
    });
    if (res.ok) ok++; else { fail++; console.error(`falhou ${bucket}/${path}: ${res.status} ${await res.text()}`); }
  }
}
console.log(`Arquivos enviados: ${ok}. Falhas: ${fail}.`);
