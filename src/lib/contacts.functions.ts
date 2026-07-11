import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optStr = (max: number) =>
  z.union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)).optional();

const optUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .transform((v) => (v ? (v as string) : null))
  .optional();

const fields = {
  name: optStr(160),
  phone: z.string().trim().min(8).max(40),
  email: optStr(160),
  client_id: optUuid,
  project_id: optUuid,
  source: optStr(80),
  opt_in: z.boolean().optional(),
  opt_out: z.boolean().optional(),
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

// ---- Brazilian phone validator: E.164 with country code 55, 10-11 digits area+number
export function normalizeBrPhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  let full = digits;
  if (full.startsWith("55") && full.length >= 12 && full.length <= 13) {
    return full;
  }
  if (full.length === 11 || full.length === 10) {
    return "55" + full;
  }
  if (full.length === 13 && full.startsWith("55")) return full;
  return null;
}

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("contacts")
      .select("*, client:clients(id,name), project:projects(id,name)")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data ?? [];
  });

export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object(fields).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const phone = normalizeBrPhone(data.phone);
    if (!phone) throw new Error("Telefone inválido");
    const payload: any = {
      ...data,
      phone,
      opt_in_at: data.opt_in ? new Date().toISOString() : null,
    };
    const { data: row, error } = await context.supabase.from("contacts").insert(payload).select().single();
    if (error) throw error;
    return row;
  });

export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...fields }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data as any;
    if (patch.phone) {
      const n = normalizeBrPhone(patch.phone);
      if (!n) throw new Error("Telefone inválido");
      patch.phone = n;
    }
    const { data: row, error } = await context.supabase.from("contacts").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return row;
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const optOutContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string(), reason: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const phone = normalizeBrPhone(data.phone);
    if (!phone) throw new Error("Telefone inválido");
    await context.supabase.from("opt_outs").upsert({ phone, reason: data.reason ?? "manual" }, { onConflict: "phone" });
    await context.supabase.from("contacts").update({ opt_out: true, opt_out_at: new Date().toISOString() }).eq("phone", phone);
    return { ok: true };
  });

// CSV import
export const importContactsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      filename: z.string().optional(),
      client_id: optUuid,
      project_id: optUuid,
      opt_in: z.boolean().default(true),
      source: z.string().default("csv"),
      rows: z.array(z.record(z.string(), z.any())).min(1).max(200000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const report = { invalidRows: [] as any[], duplicates: [] as string[] };
    let valid = 0, invalid = 0, duplicated = 0;

    const seen = new Set<string>();
    const toInsert: any[] = [];

    const KNOWN_KEYS = new Set([
      "phone", "telefone", "Telefone", "celular", "Celular",
      "name", "nome", "Nome",
      "email", "Email", "e-mail", "E-mail",
      "cpf", "CPF", "Cpf",
    ]);

    const normalizeCpf = (raw: unknown): string | null => {
      const digits = String(raw ?? "").replace(/\D+/g, "");
      if (!digits) return null;
      if (digits.length !== 11) return null;
      if (/^(\d)\1{10}$/.test(digits)) return null;
      const calc = (base: string, factor: number) => {
        let sum = 0;
        for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (factor - i);
        const mod = (sum * 10) % 11;
        return mod === 10 ? 0 : mod;
      };
      const d1 = calc(digits.slice(0, 9), 10);
      const d2 = calc(digits.slice(0, 10), 11);
      if (d1 !== parseInt(digits[9], 10) || d2 !== parseInt(digits[10], 10)) return null;
      return digits;
    };

    for (const row of data.rows) {
      const rawPhone = row.phone || row.telefone || row.Telefone || row.celular || row.Celular;
      const name = row.name || row.nome || row.Nome || null;
      const email = row.email || row.Email || row["e-mail"] || row["E-mail"] || null;
      const phone = normalizeBrPhone(String(rawPhone ?? ""));
      if (!phone) { invalid++; report.invalidRows.push({ phone: rawPhone, name, reason: "telefone inválido" }); continue; }
      if (seen.has(phone)) { duplicated++; report.duplicates.push(phone); continue; }
      seen.add(phone);

      const rawCpf = row.cpf ?? row.CPF ?? row.Cpf;
      let normalizedCpf: string | null = null;
      if (rawCpf !== undefined && rawCpf !== null && String(rawCpf).trim() !== "") {
        normalizedCpf = normalizeCpf(rawCpf);
        if (!normalizedCpf) {
          invalid++;
          report.invalidRows.push({ phone, name, cpf: rawCpf, reason: "CPF inválido" });
          continue;
        }
      }

      // Capture any extra CSV columns (e.g. protocolo) into metadata so
      // template variables like {CPF} can resolve to their values.
      const metadata: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        if (KNOWN_KEYS.has(k)) continue;
        if (v === null || v === undefined || String(v).trim() === "") continue;
        metadata[k] = v;
        metadata[k.toLowerCase()] = v;
      }
      if (normalizedCpf) {
        metadata.CPF = normalizedCpf;
        metadata.cpf = normalizedCpf;
      }
      toInsert.push({
        phone,
        name,
        email,
        client_id: data.client_id,
        project_id: data.project_id,
        source: data.source,
        opt_in: data.opt_in,
        opt_in_at: data.opt_in ? new Date().toISOString() : null,
        metadata: Object.keys(metadata).length ? metadata : {},
      });
      valid++;
    }


    if (toInsert.length) {
      // upsert ignoring duplicates by phone+client constraint
      const { error } = await context.supabase
        .from("contacts")
        .upsert(toInsert, { onConflict: "phone,client_id" as any, ignoreDuplicates: true });
      if (error) {
        // try plain insert chunked
        for (const r of toInsert) {
          await context.supabase.from("contacts").insert(r).then(() => {}, () => {});
        }
      }
    }

    const { data: job } = await context.supabase
      .from("import_jobs")
      .insert({
        filename: data.filename ?? null,
        total: data.rows.length,
        valid,
        invalid,
        duplicated,
        status: "done",
        report,
        created_by: context.userId,
      })
      .select()
      .single();

    return { job, valid, invalid, duplicated };
  });

// Tags
export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("contact_tags").select("*").order("name");
    return data ?? [];
  });

export const createTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(60), color: z.string().optional(), client_id: optUuid }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase.from("contact_tags").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const setContactTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contact_id: z.string().uuid(), tag_ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("contact_tag_assignments").delete().eq("contact_id", data.contact_id);
    if (data.tag_ids.length) {
      await context.supabase
        .from("contact_tag_assignments")
        .insert(data.tag_ids.map((t) => ({ contact_id: data.contact_id, tag_id: t })));
    }
    return { ok: true };
  });
