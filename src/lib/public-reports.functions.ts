import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function publicClient() {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const REPORT_COLUMNS =
  "id,name,total,completed,errors,completion_rate,error_rate,first_started_at,first_sent_at,last_sent_at,created_at,public_slug";

const RECORD_COLUMNS =
  "id,status,name,phone,email,created_at_source,entered_at,started_at,status_changed_at,last_sent_message_id,last_sent_at,last_received_message_id,last_received_at,error_code,error_message,message_status";

export const getPublicReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const slug = data.slug.toLowerCase();
    if (!SLUG_RE.test(slug)) return null;
    const sb = publicClient();
    const { data: row, error } = await sb
      .from("imported_dispatch_reports")
      .select(REPORT_COLUMNS)
      .eq("public_slug", slug)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const listPublicReportRecords = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        search: z.string().max(200).optional().nullable(),
        status: z.enum(["all", "completed", "error"]).default("all"),
        page: z.number().int().min(0).default(0),
        perPage: z.number().int().min(1).max(200).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const slug = data.slug.toLowerCase();
    if (!SLUG_RE.test(slug)) return { rows: [], total: 0 };
    const sb = publicClient();

    // Resolve report_id from the slug on the server — never trust a client-sent id.
    const { data: report } = await sb
      .from("imported_dispatch_reports")
      .select("id")
      .eq("public_slug", slug)
      .eq("is_public", true)
      .maybeSingle();
    if (!report) return { rows: [], total: 0 };

    let q = sb
      .from("imported_dispatch_report_records")
      .select(RECORD_COLUMNS, { count: "exact" })
      .eq("report_id", report.id);

    if (data.status !== "all") q = q.eq("status", data.status);
    const term = (data.search ?? "").trim();
    if (term) {
      const safe = term.replace(/[%,()]/g, " ");
      q = q.or(
        [`name.ilike.%${safe}%`, `phone.ilike.%${safe}%`, `email.ilike.%${safe}%`, `lead_id.ilike.%${safe}%`].join(","),
      );
    }

    const from = data.page * data.perPage;
    const { data: rows, count, error } = await q
      .order("started_at", { ascending: true, nullsFirst: false })
      .range(from, from + data.perPage - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });
