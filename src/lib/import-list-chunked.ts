export const IMPORT_CHUNK_SIZE = 1000;
/** Lotes enviados em paralelo. Mantém o banco estável e acelera bases enormes. */
export const IMPORT_CONCURRENCY = 3;

export type ImportRow = { phone: string; name?: string | null };

/**
 * Cria a lista e envia os contatos em lotes pequenos, com paralelismo controlado.
 * Evita estourar o limite de payload/tempo do servidor em bases grandes (500k+ leads).
 */
export async function createListInChunks(opts: {
  createList: (args: { data: { workspace_id: string; name: string } }) => Promise<any>;
  appendChunk: (args: {
    data: { workspace_id: string; list_id: string; source: string; rows: ImportRow[] };
  }) => Promise<any>;
  workspaceId: string;
  name: string;
  source?: string;
  rows: ImportRow[];
  onProgress?: (done: number, total: number) => void;
}) {
  const { createList, appendChunk, workspaceId, name, rows } = opts;
  const source = opts.source ?? "painel";
  const created = await createList({ data: { workspace_id: workspaceId, name } });
  const listId: string = created.list_id;

  const chunks: ImportRow[][] = [];
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + IMPORT_CHUNK_SIZE).map((r) => ({ phone: r.phone, name: r.name ?? null })));
  }

  let added = 0;
  let invalid = 0;
  let done = 0;
  let cursor = 0;
  let failure: unknown = null;

  const worker = async () => {
    while (true) {
      if (failure) return;
      const index = cursor++;
      const chunk = chunks[index];
      if (!chunk) return;

      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await appendChunk({ data: { workspace_id: workspaceId, list_id: listId, source, rows: chunk } });
          added += Number(res?.added ?? 0);
          invalid += Number(res?.invalid ?? 0);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          // backoff exponencial com jitter: timeouts pontuais não derrubam a importação
          await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt) + Math.random() * 300));
        }
      }
      if (lastErr) { failure = lastErr; return; }

      done += chunk.length;
      opts.onProgress?.(Math.min(done, rows.length), rows.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, chunks.length || 1) }, worker));
  if (failure) throw failure;

  return { list_id: listId, list_name: created.list_name as string, added, invalid };
}
