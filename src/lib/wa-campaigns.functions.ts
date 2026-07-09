import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional();

const fields = {
  name: z.string().trim().min(1).max(160),
  client_id: optUuid,
  project_id: optUuid,
  connection_id: optUuid,
  template_id: optUuid,
  template_variables: z.any().optional(),
  list_id: optUuid,
  tag_filters: z.array(z.string().uuid()).optional(),
  scheduled_at: z.union([z.string(), z.null()]).optional(),
  send_rate_per_min: z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null || v === "" ? 30 : Number(v))).optional(),
  notes: z.string().max(2000).optional().nullable(),
  participants: z.array(z.enum(["gustavo", "cayo"])).optional().default([]),
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listWaCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("wa_campaigns")
      .select("*, client:clients(id,name), project:projects(id,name), template:whatsapp_templates(id,name,language), connection:whatsapp_connections(id,name,display_phone)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getWaCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("wa_campaigns")
      .select("*, client:clients(id,name), project:projects(id,name), template:whatsapp_templates(*), connection:whatsapp_connections(id,name,display_phone,phone_number_id)")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return row;
  });

export const createWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object(fields).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("wa_campaigns")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...fields }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("wa_campaigns")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("wa_campaigns").delete().eq("id", data.id);
    return { ok: true };
  });

export const buildRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp, error } = await context.supabase
      .from("wa_campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    if (!camp.list_id) throw new Error("Selecione uma lista de contatos.");

    // Fetch contacts via list, optionally intersected with tag filters
    const { data: items } = await context.supabase
      .from("contact_list_items")
      .select("contact:contacts(id,phone,opt_in,opt_out,name)")
      .eq("list_id", camp.list_id);

    let contacts = (items ?? []).map((i: any) => i.contact).filter((c: any) => c && c.phone && c.opt_in && !c.opt_out);

    if (camp.tag_filters && camp.tag_filters.length) {
      const { data: tagged } = await context.supabase
        .from("contact_tag_assignments")
        .select("contact_id")
        .in("tag_id", camp.tag_filters);
      const ok = new Set((tagged ?? []).map((r: any) => r.contact_id));
      contacts = contacts.filter((c: any) => ok.has(c.id));
    }

    // Exclude opt-outs (global)
    const phones = contacts.map((c: any) => c.phone);
    if (phones.length) {
      const { data: oo } = await context.supabase.from("opt_outs").select("phone").in("phone", phones);
      const blocked = new Set((oo ?? []).map((r: any) => r.phone));
      contacts = contacts.filter((c: any) => !blocked.has(c.phone));
    }

    // Dedupe by phone
    const map = new Map<string, any>();
    for (const c of contacts) if (!map.has(c.phone)) map.set(c.phone, c);
    const unique = [...map.values()];

    // Clear previous recipients and insert
    await context.supabase.from("campaign_recipients").delete().eq("campaign_id", data.id);
    if (unique.length) {
      const rows = unique.map((c: any) => ({
        campaign_id: data.id,
        contact_id: c.id,
        phone: c.phone,
        variables: camp.template_variables ?? {},
        status: "pending" as const,
      }));
      // Chunk insert
      for (let i = 0; i < rows.length; i += 1000) {
        await context.supabase.from("campaign_recipients").insert(rows.slice(i, i + 1000));
      }
    }

    await context.supabase
      .from("wa_campaigns")
      .update({ total_recipients: unique.length })
      .eq("id", data.id);
    return { total: unique.length };
  });

export const startWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp } = await context.supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");
    if (!camp.connection_id || !camp.template_id) throw new Error("Configure número e template antes de iniciar.");
    if (!camp.total_recipients) throw new Error("Gere a fila de destinatários antes de iniciar.");

    // Check stock
    const { data: avail } = await context.supabase.rpc("wa_available_stock" as any, {
      _client_id: camp.client_id,
      _project_id: camp.project_id,
    });
    const available = Number(avail ?? 0);
    if (available < camp.total_recipients) {
      throw new Error(`Estoque insuficiente: ${available} disponíveis, ${camp.total_recipients} necessárias.`);
    }

    await context.supabase
      .from("wa_campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

export const scheduleWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), scheduled_at: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const when = new Date(data.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new Error("Data/hora inválida.");
    if (when.getTime() < Date.now() - 60_000) throw new Error("A data/hora deve ser futura.");

    const { data: camp } = await context.supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");
    if (!camp.connection_id || !camp.template_id) throw new Error("Configure número e template antes de agendar.");
    if (!camp.total_recipients) throw new Error("Gere a fila de destinatários antes de agendar.");

    const { data: avail } = await context.supabase.rpc("wa_available_stock" as any, {
      _client_id: camp.client_id,
      _project_id: camp.project_id,
    });
    const available = Number(avail ?? 0);
    if (available < camp.total_recipients) {
      throw new Error(`Estoque insuficiente: ${available} disponíveis, ${camp.total_recipients} necessárias.`);
    }

    const { error } = await context.supabase
      .from("wa_campaigns")
      .update({ status: "scheduled", scheduled_at: when.toISOString(), started_at: null, finished_at: null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true, scheduled_at: when.toISOString() };
  });

export const unscheduleWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("wa_campaigns")
      .update({ status: "draft", scheduled_at: null })
      .eq("id", data.id)
      .eq("status", "scheduled");
    if (error) throw error;
    return { ok: true };
  });

export const pauseWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("wa_campaigns").update({ status: "paused" }).eq("id", data.id);
    return { ok: true };
  });

export const cancelWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("wa_campaigns")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.id);
    await context.supabase
      .from("campaign_recipients")
      .update({ status: "cancelled" })
      .eq("campaign_id", data.id)
      .eq("status", "pending");
    return { ok: true };
  });

export const campaignReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp } = await context.supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    const { data: rec } = await context.supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", data.id);
    const counts: Record<string, number> = {};
    for (const r of rec ?? []) counts[(r as any).status] = (counts[(r as any).status] || 0) + 1;
    return { campaign: camp, counts, total: (rec ?? []).length };
  });

// Public availability helper (no-stock check from UI)
export const availableStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ client_id: optUuid, project_id: optUuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: avail } = await context.supabase.rpc("wa_available_stock" as any, {
      _client_id: data.client_id,
      _project_id: data.project_id,
    });
    return Number(avail ?? 0);
  });
