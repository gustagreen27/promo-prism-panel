import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional();

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
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
    const { data: row, error } = await context.supabase.from("contact_lists").insert(data).select().single();
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
