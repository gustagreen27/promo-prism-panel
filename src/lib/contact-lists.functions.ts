import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBrPhone } from "@/lib/contacts.functions";

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional();

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Workspace principal do admin (o mais antigo do qual ele é membro). */
async function adminPrimaryWorkspaceId(ctx: { supabase: any; userId: string }): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(created_at)")
    .eq("user_id", ctx.userId)
    .order("workspaces(created_at)", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.workspace_id ?? null;
}


export const listLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("contact_lists")
      .select("*, client:clients(id,name), project:projects(id,name)")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const createList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1).max(160),
      description: z.string().max(500).optional().nullable(),
      client_id: optUuid,
      project_id: optUuid,
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const wsId = await adminPrimaryWorkspaceId(context);
    const { data: row, error } = await context.supabase
      .from("contact_lists")
      .insert({ ...data, workspace_id: wsId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });


export const deleteList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("contact_lists").delete().eq("id", data.id);
    return { ok: true };
  });

export const listItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ list_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase
      .from("contact_list_items")
      .select("contact:contacts(id,name,phone,opt_in,opt_out)")
      .eq("list_id", data.list_id);
    return (rows ?? []).map((r: any) => r.contact).filter(Boolean);
  });

export const addContactsToList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ list_id: z.string().uuid(), contact_ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.contact_ids.length) return { added: 0 };
    const { data: list } = await context.supabase
      .from("contact_lists").select("workspace_id").eq("id", data.list_id).single();
    const wsId = list?.workspace_id ?? await adminPrimaryWorkspaceId(context);
    const rows = data.contact_ids.map((c) => ({ list_id: data.list_id, contact_id: c, workspace_id: wsId }));
    await context.supabase.from("contact_list_items").upsert(rows, { onConflict: "list_id,contact_id" });
    return { added: rows.length };
  });


export const removeContactFromList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ list_id: z.string().uuid(), contact_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("contact_list_items")
      .delete()
      .eq("list_id", data.list_id)
      .eq("contact_id", data.contact_id);
    return { ok: true };
  });

// Import raw phones/rows directly into a list. Creates missing contacts (opt_in),
// dedupes, links every valid contact to the list, and writes an audit row in import_jobs.
export const importPhonesToList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      list_id: z.string().uuid(),
      source: z.string().max(80).default("manual"),
      filename: z.string().max(200).optional().nullable(),
      rows: z.array(z.object({
        phone: z.string().min(1),
        name: z.string().max(160).optional().nullable(),
        email: z.string().max(160).optional().nullable(),
      })).min(1).max(200000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase;

    const { data: list } = await supabase
      .from("contact_lists")
      .select("workspace_id,client_id,project_id,name")
      .eq("id", data.list_id)
      .single();
    const wsId = list?.workspace_id ?? await adminPrimaryWorkspaceId(context);

    // 1. Normalize + dedup, keep per-row diagnostics
    const seen = new Set<string>();
    const normalized: { phone: string; name: string | null; email: string | null }[] = [];
    const invalidRows: { input: string; name?: string | null; reason: string }[] = [];
    let duplicates = 0;

    for (const r of data.rows) {
      const raw = String(r.phone ?? "").trim();
      if (!raw) { invalidRows.push({ input: raw, name: r.name, reason: "vazio" }); continue; }
      const phone = normalizeBrPhone(raw);
      if (!phone) { invalidRows.push({ input: raw, name: r.name, reason: "telefone inválido" }); continue; }
      if (seen.has(phone)) { duplicates++; continue; }
      seen.add(phone);
      normalized.push({ phone, name: r.name ?? null, email: r.email ?? null });
    }

    const stats = {
      total_input: data.rows.length,
      normalized: normalized.length,
      duplicates,
      invalid: invalidRows.length,
      existing_contacts: 0,
      created_contacts: 0,
      linked: 0,
      already_linked: 0,
    };

    const finish = async (status: "completed" | "failed", error?: string) => {
      await supabase.from("import_jobs").insert({
        filename: data.filename ?? `${data.source}:${list?.name ?? data.list_id}`,
        total: stats.total_input,
        valid: stats.normalized,
        invalid: stats.invalid,
        duplicated: stats.duplicates,
        status,
        workspace_id: wsId,
        created_by: context.userId,
        report: { stats, invalidRows, list_id: data.list_id, source: data.source, error },
      });
    };

    if (!normalized.length) {
      await finish("completed");
      return { ...stats, invalidRows };
    }

    try {
      const phones = normalized.map((n) => n.phone);
      const clientId = list?.client_id ?? null;

      // 2. Buscar existentes por telefone (chunks para evitar URLs enormes)
      const existing: { id: string; phone: string }[] = [];
      const CHUNK = 500;
      for (let i = 0; i < phones.length; i += CHUNK) {
        const slice = phones.slice(i, i + CHUNK);
        let q = supabase.from("contacts").select("id,phone").in("phone", slice);
        q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
        if (wsId) q = q.eq("workspace_id", wsId);
        const { data: rows, error } = await q;
        if (error) throw error;
        for (const r of rows ?? []) existing.push(r);
      }
      const existingByPhone = new Map(existing.map((c) => [c.phone, c.id]));
      stats.existing_contacts = existing.length;

      // 3. Inserir só os novos
      const toInsert = normalized
        .filter((n) => !existingByPhone.has(n.phone))
        .map((n) => ({
          phone: n.phone,
          name: n.name,
          email: n.email,
          workspace_id: wsId,
          client_id: clientId,
          project_id: list?.project_id ?? null,
          source: data.source,
          opt_in: true,
          opt_in_at: new Date().toISOString(),
        }));

      const inserted: { id: string; phone: string }[] = [];
      for (let i = 0; i < toInsert.length; i += 1000) {
        const chunk = toInsert.slice(i, i + 1000);
        const { data: ins, error } = await supabase.from("contacts").insert(chunk).select("id,phone");
        if (error) throw error;
        for (const r of ins ?? []) inserted.push(r);
      }
      stats.created_contacts = inserted.length;

      // 4. Reabrir opt-in dos existentes
      if (existing.length) {
        await supabase
          .from("contacts")
          .update({ opt_in: true, opt_out: false, opt_in_at: new Date().toISOString(), workspace_id: wsId })
          .in("id", existing.map((c) => c.id));
      }

      // 5. Verificar links já existentes p/ contar duplicatas de link
      const allContacts = [...existing, ...inserted];
      const contactIds = allContacts.map((c) => c.id);
      const alreadyLinked = new Set<string>();
      for (let i = 0; i < contactIds.length; i += 1000) {
        const slice = contactIds.slice(i, i + 1000);
        const { data: linkRows } = await supabase
          .from("contact_list_items")
          .select("contact_id")
          .eq("list_id", data.list_id)
          .in("contact_id", slice);
        for (const r of linkRows ?? []) alreadyLinked.add(r.contact_id);
      }
      stats.already_linked = alreadyLinked.size;

      // 6. Upsert dos links (id + link keys)
      for (let i = 0; i < allContacts.length; i += 1000) {
        const chunk = allContacts.slice(i, i + 1000);
        const items = chunk.map((c) => ({ list_id: data.list_id, contact_id: c.id, workspace_id: wsId }));
        const { error } = await supabase
          .from("contact_list_items")
          .upsert(items, { onConflict: "list_id,contact_id" });
        if (error) throw error;
      }
      stats.linked = allContacts.length - alreadyLinked.size;

      await finish("completed");
      return { ...stats, invalidRows };
    } catch (e: any) {
      await finish("failed", e?.message ?? String(e));
      throw e;
    }
  });

/** Recalcula os links de uma lista: garante que todo contato ativo com o mesmo escopo e opt_in
 * esteja linkado. Útil quando algum import antigo falhou e a lista ficou vazia. */
export const resyncList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ list_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase;

    const { data: list, error: le } = await supabase
      .from("contact_lists")
      .select("workspace_id,client_id,name")
      .eq("id", data.list_id)
      .single();
    if (le || !list) throw new Error("Lista não encontrada");

    // Contatos já linkados
    const { data: linked } = await supabase
      .from("contact_list_items")
      .select("contact_id")
      .eq("list_id", data.list_id);
    const linkedIds = new Set<string>((linked ?? []).map((r: any) => r.contact_id));

    // Garantir workspace_id nos itens
    if (list.workspace_id) {
      await supabase
        .from("contact_list_items")
        .update({ workspace_id: list.workspace_id })
        .eq("list_id", data.list_id)
        .is("workspace_id", null);
    }

    // Remover links órfãos (contato deletado)
    let removedOrphans = 0;
    if (linkedIds.size) {
      const ids = [...linkedIds];
      const alive = new Set<string>();
      for (let i = 0; i < ids.length; i += 1000) {
        const { data: cs } = await supabase.from("contacts").select("id").in("id", ids.slice(i, i + 1000));
        for (const r of cs ?? []) alive.add(r.id);
      }
      const dead = ids.filter((id) => !alive.has(id));
      if (dead.length) {
        for (let i = 0; i < dead.length; i += 1000) {
          await supabase
            .from("contact_list_items")
            .delete()
            .eq("list_id", data.list_id)
            .in("contact_id", dead.slice(i, i + 1000));
        }
        removedOrphans = dead.length;
      }
    }

    const finalCount = linkedIds.size - removedOrphans;
    return {
      list_id: data.list_id,
      list_name: list.name,
      linked_now: finalCount,
      removed_orphans: removedOrphans,
    };
  });

/** Últimos jobs de import do workspace do admin */
export const listImportJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("import_jobs")
      .select("id,filename,total,valid,invalid,duplicated,status,report,created_at,created_by")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
