import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderMapping, fillMetaTemplate, metaVarsIn, buildContext } from "@/lib/wa-variables";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional();

/** Count deduplicated audience after opt-out exclusion and optional tag filter. */
export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    list_id: z.string().uuid(),
    tag_filters: z.array(z.string().uuid()).optional().default([]),
    sample_size: z.number().int().min(0).max(10).optional().default(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: items } = await context.supabase
      .from("contact_list_items")
      .select("contact:contacts(id,phone,name,email,opt_in,opt_out)")
      .eq("list_id", data.list_id);
    let contacts = (items ?? []).map((i: any) => i.contact).filter((c: any) => c && c.phone && c.opt_in && !c.opt_out);

    if (data.tag_filters.length) {
      const { data: tagged } = await context.supabase
        .from("contact_tag_assignments").select("contact_id").in("tag_id", data.tag_filters);
      const ok = new Set((tagged ?? []).map((r: any) => r.contact_id));
      contacts = contacts.filter((c: any) => ok.has(c.id));
    }

    const phones = contacts.map((c: any) => c.phone);
    let optOutCount = 0;
    if (phones.length) {
      const { data: oo } = await context.supabase.from("opt_outs").select("phone").in("phone", phones);
      const blocked = new Set((oo ?? []).map((r: any) => r.phone));
      optOutCount = contacts.filter((c: any) => blocked.has(c.phone)).length;
      contacts = contacts.filter((c: any) => !blocked.has(c.phone));
    }

    const dedup = new Map<string, any>();
    let dupCount = 0;
    for (const c of contacts) {
      if (dedup.has(c.phone)) dupCount++;
      else dedup.set(c.phone, c);
    }
    const unique = [...dedup.values()];
    return {
      total: unique.length,
      raw_count: (items ?? []).length,
      opt_out_removed: optOutCount,
      duplicates_removed: dupCount,
      sample: unique.slice(0, data.sample_size).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })),
    };
  });

const mappingSchema = z.object({
  variables_mapping: z.record(z.string(), z.string()).default({}),
  button_url_mapping: z.record(z.string(), z.string()).optional().default({}),
});

/** Render one preview of the message body + button URL for a single contact. */
export const renderPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template_id: z.string().uuid(),
    contact_id: z.string().uuid().optional(),
    client_id: optUuid,
    project_id: optUuid,
    ...mappingSchema.shape,
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [tplRes, contactRes, clientRes, projectRes] = await Promise.all([
      context.supabase.from("whatsapp_templates").select("*").eq("id", data.template_id).single(),
      data.contact_id
        ? context.supabase.from("contacts").select("*").eq("id", data.contact_id).single()
        : Promise.resolve({ data: null }),
      data.client_id ? context.supabase.from("clients").select("*").eq("id", data.client_id).single() : Promise.resolve({ data: null }),
      data.project_id ? context.supabase.from("projects").select("*").eq("id", data.project_id).single() : Promise.resolve({ data: null }),
    ]);
    if (tplRes.error) throw tplRes.error;
    const tpl = tplRes.data;
    const ctx = buildContext({
      contact: (contactRes as any).data,
      client: (clientRes as any).data,
      project: (projectRes as any).data,
    });

    const bodyVars = metaVarsIn(tpl.body ?? "");
    const resolved: Record<number, string> = {};
    for (const n of bodyVars) {
      const mapping = data.variables_mapping[String(n)] ?? "";
      resolved[n] = renderMapping(mapping, ctx);
    }
    const bodyRendered = fillMetaTemplate(tpl.body ?? "", resolved);

    let buttonRendered: { text: string; url: string }[] = [];
    const btns = (Array.isArray(tpl.buttons) ? tpl.buttons : []) as any[];
    for (const raw of btns) {
      const b: any = raw ?? {};
      if ((b.type || "").toString().toLowerCase() === "url" && b.url) {
        const urlVars = metaVarsIn(String(b.url));
        const urlResolved: Record<number, string> = {};
        for (const n of urlVars) {
          const mapping = (data.button_url_mapping ?? {})[String(n)] ?? "";
          urlResolved[n] = renderMapping(mapping, ctx);
        }
        buttonRendered.push({ text: String(b.text ?? ""), url: fillMetaTemplate(String(b.url), urlResolved) });
      } else if (b.text) {
        buttonRendered.push({ text: String(b.text), url: "" });
      }
    }
    return {
      body: bodyRendered,
      header: tpl.header_text ?? null,
      footer: tpl.footer ?? null,
      buttons: buttonRendered,
      warnings: bodyVars.filter((n) => !resolved[n] || resolved[n].trim() === "").map((n) => `Variável {{${n}}} vazia para este contato`),
    };
  });

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  client_id: optUuid,
  project_id: optUuid,
  responsavel_id: optUuid,
  connection_id: z.string().uuid(),
  template_id: z.string().uuid(),
  list_id: z.string().uuid(),
  tag_filters: z.array(z.string().uuid()).optional().default([]),
  scheduled_at: z.union([z.string(), z.null()]).optional(),
  send_rate_per_min: z.number().int().min(1).max(2400).optional().default(30),
  notes: z.string().max(2000).optional().nullable(),
  variables_mapping: z.record(z.string(), z.string()).default({}),
  button_url_mapping: z.record(z.string(), z.string()).optional().default({}),
  custom_fields: z.record(z.string(), z.string()).optional().default({}),
});

/** Create the campaign row from wizard input; recipients are built by a separate step. */
export const createCampaignFromWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // pull waba_ref_id from the connection so we keep the WABA link
    const { data: conn } = await context.supabase
      .from("whatsapp_connections").select("waba_ref_id").eq("id", data.connection_id).single();

    const { data: row, error } = await context.supabase
      .from("wa_campaigns")
      .insert({
        ...data,
        template_variables: data.variables_mapping, // legacy mirror
        waba_ref_id: conn?.waba_ref_id ?? null,
        status: data.scheduled_at ? "scheduled" : "draft",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });
