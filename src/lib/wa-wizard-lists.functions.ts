import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBrPhone } from "@/lib/contacts.functions";

async function assertWsMember(ctx: { supabase: any; userId: string }, workspaceId: string) {
  const { data, error } = await ctx.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error || !data) throw new Error("Sem permissão neste workspace");
  const writeRoles = ["owner", "admin", "operator"];
  if (!writeRoles.includes(data.role)) throw new Error("Seu papel não permite criar listas");
}

/** Lista listas do workspace com contagem. */
export const listWorkspaceLists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; only_mine?: boolean }) =>
    z.object({ workspace_id: z.string().uuid(), only_mine: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWsMember(context as any, data.workspace_id);
    const { supabase, userId } = context as any;
    let q = supabase
      .from("contact_lists")
      .select("id,name,description,created_at")
      .eq("workspace_id", data.workspace_id);
    if (data.only_mine) q = q.eq("created_by", userId);
    const { data: lists } = await q.order("created_at", { ascending: false });
    const ids = (lists ?? []).map((l: any) => l.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      // Uma query `count exact head` por lista — evita o teto de 1000 linhas
      // do PostgREST que fazia listas grandes "engolirem" a contagem das pequenas.
      const results = await Promise.all(
        ids.map((id: string) =>
          supabase
            .from("contact_list_items")
            .select("list_id", { count: "exact", head: true })
            .eq("list_id", id)
            .then((r: any) => ({ id, count: r?.count ?? 0 })),
        ),
      );
      for (const r of results) counts[r.id] = r.count;
    }
    return { lists: (lists ?? []).map((l: any) => ({ ...l, count: counts[l.id] ?? 0 })) };
  });

/** Contagem de contatos de uma lista (pré-visualização).
 *  Usa counts + amostra pequena para não estourar memória/timeout com listas de 100k+.
 */
export const previewWorkspaceList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; list_id: string }) =>
    z.object({ workspace_id: z.string().uuid(), list_id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertWsMember(context as any, data.workspace_id);
    const { supabase } = context as any;

    // 1) Total de itens na lista (head count, não traz linhas)
    const totalRes = await supabase
      .from("contact_list_items")
      .select("list_id", { count: "exact", head: true })
      .eq("list_id", data.list_id);
    const total = totalRes.count ?? 0;

    // 2) Amostra pequena de contatos válidos (para exibir na coluna direita)
    const SAMPLE = 50;
    const { data: sampleRows, error: sampleErr } = await supabase
      .from("contact_list_items")
      .select("contact:contacts!inner(id,name,phone,opt_in,opt_out)")
      .eq("list_id", data.list_id)
      .eq("contact.opt_in", true)
      .eq("contact.opt_out", false)
      .not("contact.phone", "is", null)
      .limit(SAMPLE);
    if (sampleErr) throw sampleErr;
    const sample = (sampleRows ?? [])
      .map((r: any) => r.contact)
      .filter(Boolean)
      .map((c: any) => ({ id: c.id, name: c.name, phone: c.phone }));

    // 3) Contagem de válidos (head count com filtro no join)
    let valid = 0;
    try {
      const validRes = await supabase
        .from("contact_list_items")
        .select("contact:contacts!inner(id)", { count: "exact", head: true })
        .eq("list_id", data.list_id)
        .eq("contact.opt_in", true)
        .eq("contact.opt_out", false)
        .not("contact.phone", "is", null);
      valid = validRes.count ?? 0;
    } catch {
      valid = total; // fallback conservador
    }

    return {
      total,
      valid,
      opt_out: Math.max(0, total - valid),
      sample,
    };
  });

/** Cria uma lista no workspace e importa telefones em uma única chamada. */
export const createWorkspaceListWithPhones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      workspace_id: z.string().uuid(),
      name: z.string().min(1),
      source: z.string().default("wizard"),
      rows: z.array(z.object({
        phone: z.string().min(1),
        name: z.string().optional().nullable(),
      })),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertWsMember(context as any, data.workspace_id);
    const { supabase } = context as any;

    // 1. Cria a lista
    const { data: list, error: listErr } = await supabase
      .from("contact_lists")
      .insert({ name: data.name, workspace_id: data.workspace_id, created_by: (context as any).userId })
      .select("id,name")
      .single();
    if (listErr) throw listErr;

    // 2. Normaliza + dedup
    const seen = new Set<string>();
    const normalized: { phone: string; name: string | null }[] = [];
    let invalid = 0;
    for (const r of data.rows) {
      const phone = normalizeBrPhone(r.phone);
      if (!phone) { invalid++; continue; }
      if (seen.has(phone)) continue;
      seen.add(phone);
      normalized.push({ phone, name: r.name ?? null });
    }
    if (!normalized.length) {
      return { list_id: list.id, list_name: list.name, added: 0, created: 0, invalid };
    }

    const phones = normalized.map((n) => n.phone);

    // 3. Buscar contatos já existentes no workspace por telefone (em chunks p/ evitar URLs enormes)
    const existing: { id: string; phone: string }[] = [];
    const CHUNK = 500;
    for (let i = 0; i < phones.length; i += CHUNK) {
      const slice = phones.slice(i, i + CHUNK);
      const { data: rows, error: selErr } = await supabase
        .from("contacts")
        .select("id,phone")
        .eq("workspace_id", data.workspace_id)
        .in("phone", slice);
      if (selErr) throw selErr;
      for (const r of rows ?? []) existing.push(r);
    }
    const existingByPhone = new Map(existing.map((c) => [c.phone, c.id]));

    // 4. Inserir apenas os novos
    const toInsert = normalized
      .filter((n) => !existingByPhone.has(n.phone))
      .map((n) => ({
        phone: n.phone,
        name: n.name,
        workspace_id: data.workspace_id,
        client_id: null,
        source: data.source,
        opt_in: true,
        opt_in_at: new Date().toISOString(),
      }));

    const insertedIds: { id: string; phone: string }[] = [];
    for (let i = 0; i < toInsert.length; i += 1000) {
      const chunk = toInsert.slice(i, i + 1000);
      const { data: ins, error: insErr } = await supabase
        .from("contacts")
        .insert(chunk)
        .select("id,phone");
      if (insErr) throw insErr;
      for (const r of ins ?? []) insertedIds.push(r);
    }

    // 5. Reabrir opt-in dos existentes (mantém contatos previamente bloqueados fora)
    if (existing.length) {
      await supabase
        .from("contacts")
        .update({ opt_in: true, opt_out: false, opt_in_at: new Date().toISOString() })
        .eq("workspace_id", data.workspace_id)
        .in("id", existing.map((c) => c.id));
    }

    // 6. Linkar na lista (existentes + novos)
    const allContacts = [...existing, ...insertedIds];
    for (let i = 0; i < allContacts.length; i += 1000) {
      const chunk = allContacts.slice(i, i + 1000);
      const items = chunk.map((c) => ({ list_id: list.id, contact_id: c.id, workspace_id: data.workspace_id }));
      const { error: linkErr } = await supabase
        .from("contact_list_items")
        .upsert(items, { onConflict: "list_id,contact_id" });
      if (linkErr) throw linkErr;
    }
    const contacts = allContacts;

    return { list_id: list.id, list_name: list.name, added: contacts.length, created: normalized.length, invalid };
  });
