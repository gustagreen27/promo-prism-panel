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
  .inputValidator((d: { workspace_id: string }) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWsMember(context as any, data.workspace_id);
    const { supabase } = context as any;
    const { data: lists } = await supabase
      .from("contact_lists")
      .select("id,name,description,created_at")
      .eq("workspace_id", data.workspace_id)
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = (lists ?? []).map((l: any) => l.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: rows } = await supabase
        .from("contact_list_items")
        .select("list_id")
        .in("list_id", ids);
      for (const r of rows ?? []) counts[r.list_id] = (counts[r.list_id] ?? 0) + 1;
    }
    return { lists: (lists ?? []).map((l: any) => ({ ...l, count: counts[l.id] ?? 0 })) };
  });

/** Contagem de contatos de uma lista (pré-visualização). */
export const previewWorkspaceList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; list_id: string }) =>
    z.object({ workspace_id: z.string().uuid(), list_id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertWsMember(context as any, data.workspace_id);
    const { supabase } = context as any;
    const { data: items } = await supabase
      .from("contact_list_items")
      .select("contact:contacts(id,name,phone,opt_in,opt_out)")
      .eq("list_id", data.list_id);
    const all = (items ?? []).map((r: any) => r.contact).filter(Boolean);
    const valid = all.filter((c: any) => c.opt_in && !c.opt_out && c.phone);
    return {
      total: all.length,
      valid: valid.length,
      opt_out: all.length - valid.length,
      sample: valid.slice(0, 5).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })),
    };
  });

/** Cria uma lista no workspace e importa telefones em uma única chamada. */
export const createWorkspaceListWithPhones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      workspace_id: z.string().uuid(),
      name: z.string().min(1).max(160),
      source: z.string().max(80).default("wizard"),
      rows: z.array(z.object({
        phone: z.string().min(1),
        name: z.string().max(160).optional().nullable(),
      })).min(1).max(20000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertWsMember(context as any, data.workspace_id);
    const { supabase } = context as any;

    // 1. Cria a lista
    const { data: list, error: listErr } = await supabase
      .from("contact_lists")
      .insert({ name: data.name, workspace_id: data.workspace_id })
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

    // 3. Upsert contacts (scope: workspace, client_id NULL)
    const toUpsert = normalized.map((n) => ({
      phone: n.phone,
      name: n.name,
      workspace_id: data.workspace_id,
      client_id: null,
      source: data.source,
      opt_in: true,
      opt_in_at: new Date().toISOString(),
    }));
    await supabase.from("contacts").upsert(toUpsert, { onConflict: "phone,client_id" as any, ignoreDuplicates: true });

    // 4. Re-abrir opt-in se contato já existir bloqueado
    await supabase
      .from("contacts")
      .update({ opt_in: true, opt_out: false, opt_in_at: new Date().toISOString() })
      .in("phone", normalized.map((n) => n.phone))
      .eq("workspace_id", data.workspace_id);

    // 5. Buscar ids
    const { data: rows } = await supabase
      .from("contacts")
      .select("id,phone")
      .in("phone", normalized.map((n) => n.phone))
      .eq("workspace_id", data.workspace_id);
    const contacts = (rows ?? []) as { id: string; phone: string }[];

    // 6. Linkar na lista
    if (contacts.length) {
      const items = contacts.map((c) => ({ list_id: list.id, contact_id: c.id, workspace_id: data.workspace_id }));
      await supabase.from("contact_list_items").upsert(items, { onConflict: "list_id,contact_id" });
    }

    return { list_id: list.id, list_name: list.name, added: contacts.length, created: normalized.length, invalid };
  });
