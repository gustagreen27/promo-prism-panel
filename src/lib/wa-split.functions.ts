// Disparo multi-BM: divide uma mesma lista entre várias BMs/WABAs,
// criando uma campanha filha por "perna" (BM + número + template).
// Reaproveita 100% do motor de envio existente — cada filha é uma campanha normal.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Números ativos + WABA/BM + templates aprovados, agrupados para montagem das pernas. */
export const listSplitTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).passthrough().parse(d ?? {}))
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as any;

    const [connRes, wabaRes, tplRes, listRes] = await Promise.all([
      supabase
        .from("whatsapp_connections")
        .select("id, name, nome_interno, display_name, display_phone, phone, phone_number_id, waba_id, waba_ref_id, status, workspace_id")
        .order("display_name", { ascending: true }),
      supabase.from("whatsapp_wabas").select("id, nome_interno, waba_id, business_id, status, workspace_id"),
      supabase
        .from("whatsapp_templates")
        .select("id, name, language, status, category, body, buttons, header_type, waba_ref_id, connection_id")
        .order("name", { ascending: true }),
      supabase.from("contact_lists").select("id, name, created_at").order("created_at", { ascending: false }),
    ]);

    const wabas = (wabaRes.data ?? []) as any[];
    const wabaById = new Map(wabas.map((w) => [w.id, w]));

    const connections = ((connRes.data ?? []) as any[]).map((c) => {
      const w = c.waba_ref_id ? wabaById.get(c.waba_ref_id) : null;
      return {
        id: c.id,
        label: c.display_name ?? c.nome_interno ?? c.name ?? "—",
        phone: c.display_phone ?? c.phone ?? null,
        phone_number_id: c.phone_number_id ?? null,
        status: c.status,
        workspace_id: c.workspace_id ?? null,
        waba_ref_id: c.waba_ref_id ?? null,
        waba_id: c.waba_id ?? w?.waba_id ?? null,
        waba_name: w?.nome_interno ?? null,
        business_id: w?.business_id ?? null,
      };
    });

    const templates = ((tplRes.data ?? []) as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category ?? null,
      body: t.body ?? "",
      buttons: t.buttons ?? [],
      header_type: t.header_type ?? null,
      waba_ref_id: t.waba_ref_id ?? null,
      connection_id: t.connection_id ?? null,
    }));

    return {
      connections,
      templates,
      lists: (listRes.data ?? []) as any[],
      businesses: Array.from(
        new Map(
          connections
            .filter((c) => c.business_id)
            .map((c) => [c.business_id as string, { business_id: c.business_id as string, waba_name: c.waba_name }]),
        ).values(),
      ),
    };
  });

const legSchema = z.object({
  connection_id: z.string().uuid(),
  template_id: z.string().uuid(),
  weight: z.number().int().min(1).max(1_000_000).default(1),
  variables_mapping: z.record(z.string(), z.string()).optional().default({}),
  button_url_mapping: z.record(z.string(), z.string()).optional().default({}),
  /** Mídia de cabeçalho própria da combinação. Vazio = herda a mídia principal. */
  header_media_url: z.string().optional().nullable(),
});

const createSplitSchema = z.object({
  name: z.string().trim().min(1).max(140),
  list_id: z.string().uuid(),
  workspace_id: z.string().uuid().nullish(),
  legs: z.array(legSchema).min(1).max(50),
  variables_mapping: z.record(z.string(), z.string()).optional().default({}),
  button_url_mapping: z.record(z.string(), z.string()).optional().default({}),
  /** Mídia de cabeçalho enviada no assistente (substitui a mídia aprovada do template). */
  header_media_url: z.string().optional().nullable(),

  send_rate_per_min: z.number().int().min(1).max(2400).optional().default(60),
  batch_size: z.number().int().min(1).max(500).optional().default(25),
  rate_per_second: z.number().int().min(1).max(500).nullable().optional(),
  max_concurrency: z.number().int().min(1).max(500).nullable().optional(),
  max_per_day: z.number().int().min(1).max(10_000_000).nullable().optional(),
  timezone: z.string().optional().default("America/Sao_Paulo"),
  scheduled_at: z.union([z.string(), z.null()]).optional(),
  start_now: z.boolean().optional().default(false),
});

/** Cria o grupo: uma campanha por BM e divide os contatos da lista pelos pesos. */
export const createSplitDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSplitSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as any;
    const groupId = crypto.randomUUID();

    const connIds = data.legs.map((l) => l.connection_id);
    const { data: conns } = await supabase
      .from("whatsapp_connections")
      .select("id, waba_ref_id, workspace_id, display_name, nome_interno, name, display_phone, phone")
      .in("id", connIds);
    const connById = new Map(((conns ?? []) as any[]).map((c) => [c.id, c]));

    const created: { id: string; index: number }[] = [];
    for (let i = 0; i < data.legs.length; i++) {
      const leg = data.legs[i]!;
      const conn = connById.get(leg.connection_id);
      const legLabel = conn?.display_name ?? conn?.nome_interno ?? conn?.name ?? conn?.display_phone ?? `BM ${i + 1}`;
      const vars = { ...(data.variables_mapping ?? {}), ...(leg.variables_mapping ?? {}) };
      const btns = { ...(data.button_url_mapping ?? {}), ...(leg.button_url_mapping ?? {}) };

      const { data: row, error } = await supabase
        .from("wa_campaigns")
        .insert({
          name: `${data.name} — ${i + 1}/${data.legs.length} · ${legLabel}`,
          workspace_id: data.workspace_id ?? conn?.workspace_id ?? null,
          connection_id: leg.connection_id,
          template_id: leg.template_id,
          waba_ref_id: conn?.waba_ref_id ?? null,
          list_id: data.list_id,
          variables_mapping: vars,
          template_variables: vars,
          button_url_mapping: btns,
          send_rate_per_min: data.send_rate_per_min,
          batch_size: data.batch_size,
          rate_per_second: data.rate_per_second ?? null,
          max_concurrency: data.max_concurrency ?? null,
          max_per_day: data.max_per_day ?? null,
          timezone: data.timezone,
          scheduled_at: data.scheduled_at ?? null,
          status: data.scheduled_at ? "scheduled" : "draft",
          split_group_id: groupId,
          split_group_name: data.name,
          split_group_index: i + 1,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      created.push({ id: row.id as string, index: i + 1 });
    }

    const { data: split, error: splitErr } = await supabase.rpc("wa_split_build_recipients" as any, {
      _campaign_ids: created.map((c) => c.id),
      _list_id: data.list_id,
      _weights: data.legs.map((l) => l.weight),
    });
    if (splitErr) {
      await supabase.from("wa_campaigns").delete().eq("split_group_id", groupId);
      throw new Error(splitErr.message);
    }

    if (data.start_now) {
      await supabase
        .from("wa_campaigns")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("split_group_id", groupId)
        .gt("total_recipients", 0);
      kickTick();
    }

    return { group_id: groupId, campaigns: created, split };
  });

function kickTick() {
  try {
    const base =
      process.env.SUPABASE_URL?.replace(".supabase.co", ".lovable.app") ??
      "https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app";
    fetch(new URL("/api/public/whatsapp/queue-tick", base).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => {});
  } catch { /* noop */ }
}

/** Lista os grupos multi-BM com progresso agregado. */
export const listSplitGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any)
      .from("wa_campaigns")
      .select("id, name, status, split_group_id, split_group_name, split_group_index, total_recipients, sent_count, delivered_count, failed_count, replied_count, created_at, scheduled_at, connection:whatsapp_connections(id,display_name,display_phone), template:whatsapp_templates(id,name,language)")
      .not("split_group_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const groups = new Map<string, any>();
    for (const r of (data ?? []) as any[]) {
      const g = groups.get(r.split_group_id) ?? {
        group_id: r.split_group_id,
        name: r.split_group_name ?? "Grupo",
        created_at: r.created_at,
        legs: [] as any[],
        total: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        replied: 0,
      };
      g.legs.push(r);
      g.total += r.total_recipients ?? 0;
      g.sent += r.sent_count ?? 0;
      g.delivered += r.delivered_count ?? 0;
      g.failed += r.failed_count ?? 0;
      g.replied += r.replied_count ?? 0;
      groups.set(r.split_group_id, g);
    }
    return Array.from(groups.values()).map((g) => ({
      ...g,
      legs: g.legs.sort((a: any, b: any) => (a.split_group_index ?? 0) - (b.split_group_index ?? 0)),
      statuses: Array.from(new Set(g.legs.map((l: any) => l.status))),
    }));
  });

const groupAction = z.object({
  group_id: z.string().uuid(),
  action: z.enum(["start", "pause", "resume", "cancel", "delete"]),
});

/** Ação em lote sobre todas as campanhas do grupo. */
export const splitGroupAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => groupAction.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as any;
    const now = new Date().toISOString();

    if (data.action === "delete") {
      const { error } = await supabase.from("wa_campaigns").delete().eq("split_group_id", data.group_id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    let patch: Record<string, unknown> = {};
    if (data.action === "start") patch = { status: "running", started_at: now, paused_at: null };
    if (data.action === "resume") patch = { status: "running", resumed_at: now, pause_reason: null };
    if (data.action === "pause") patch = { status: "paused", paused_at: now };
    if (data.action === "cancel") patch = { status: "cancelled", canceled_at: now };

    const q = supabase.from("wa_campaigns").update(patch).eq("split_group_id", data.group_id);
    const { error } = data.action === "start" || data.action === "resume" ? await q.gt("total_recipients", 0) : await q;
    if (error) throw new Error(error.message);
    if (data.action === "start" || data.action === "resume") kickTick();
    return { ok: true };
  });
