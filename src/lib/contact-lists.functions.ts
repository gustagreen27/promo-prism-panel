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
    const rows = data.contact_ids.map((c) => ({ list_id: data.list_id, contact_id: c }));
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
// dedupes, and links every valid contact to the list in a single call.
export const importPhonesToList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      list_id: z.string().uuid(),
      source: z.string().max(80).default("manual"),
      rows: z.array(z.object({
        phone: z.string().min(1),
        name: z.string().max(160).optional().nullable(),
        email: z.string().max(160).optional().nullable(),
      })).min(1).max(20000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // fetch list to inherit client/project scoping
    const { data: list } = await context.supabase
      .from("contact_lists")
      .select("client_id,project_id")
      .eq("id", data.list_id)
      .single();

    const seen = new Set<string>();
    const normalized: { phone: string; name: string | null; email: string | null }[] = [];
    let invalid = 0;
    const invalidRows: any[] = [];

    for (const r of data.rows) {
      const phone = normalizeBrPhone(r.phone);
      if (!phone) { invalid++; invalidRows.push({ phone: r.phone, name: r.name }); continue; }
      if (seen.has(phone)) continue;
      seen.add(phone);
      normalized.push({ phone, name: r.name ?? null, email: r.email ?? null });
    }

    if (!normalized.length) return { added: 0, created: 0, invalid, invalidRows };

    // upsert contacts by phone+client_id
    const toUpsert = normalized.map((n) => ({
      phone: n.phone,
      name: n.name,
      email: n.email,
      client_id: list?.client_id ?? null,
      project_id: list?.project_id ?? null,
      source: data.source,
      opt_in: true,
      opt_in_at: new Date().toISOString(),
    }));

    await context.supabase
      .from("contacts")
      .upsert(toUpsert, { onConflict: "phone,client_id" as any, ignoreDuplicates: true });

    // Ensure imported phones are opted-in (fixes existing contacts stuck at opt_in=false/opt_out=true)
    {
      let uq = context.supabase
        .from("contacts")
        .update({ opt_in: true, opt_out: false, opt_in_at: new Date().toISOString() })
        .in("phone", normalized.map((n) => n.phone));
      uq = list?.client_id ? uq.eq("client_id", list.client_id) : uq.is("client_id", null);
      await uq;
    }

    // fetch resulting contact ids for those phones (scoped to list's client_id)
    let q = context.supabase.from("contacts").select("id,phone").in("phone", normalized.map((n) => n.phone));
    q = list?.client_id ? q.eq("client_id", list.client_id) : q.is("client_id", null);
    const { data: contactRows } = await q;
    const contacts = (contactRows ?? []) as { id: string; phone: string }[];

    if (contacts.length) {
      const items = contacts.map((c) => ({ list_id: data.list_id, contact_id: c.id }));
      await context.supabase.from("contact_list_items").upsert(items, { onConflict: "list_id,contact_id" });
    }

    return {
      added: contacts.length,
      created: normalized.length,
      invalid,
      invalidRows,
    };
  });
