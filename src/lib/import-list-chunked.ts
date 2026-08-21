export const IMPORT_CHUNK_SIZE = 2500;

export type ImportRow = { phone: string; name?: string | null };

/**
 * Cria a lista e envia os contatos em lotes pequenos. Evita estourar o limite de
 * payload/tempo do servidor em bases grandes (70k+ leads).
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

  let added = 0;
  let invalid = 0;
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE).map((r) => ({ phone: r.phone, name: r.name ?? null }));
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await appendChunk({ data: { workspace_id: workspaceId, list_id: listId, source, rows: chunk } });
        added += Number(res?.added ?? 0);
        invalid += Number(res?.invalid ?? 0);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    if (lastErr) throw lastErr;
    opts.onProgress?.(Math.min(i + IMPORT_CHUNK_SIZE, rows.length), rows.length);
  }

  return { list_id: listId, list_name: created.list_name as string, added, invalid };
}
