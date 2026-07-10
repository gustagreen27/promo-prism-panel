import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optStr = (max: number) =>
  z.union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)).optional();
const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()])
  .transform((v) => (v ? (v as string) : null)).optional();

const fields = {
  client_id: optUuid,
  project_id: optUuid,
  workspace_id: optUuid,
  campaign_id: optUuid,
  title: z.string().trim().min(1).max(160),
  description: optStr(2000),
  event_type: z.string().trim().min(1).max(60),
  start_time: z.string().min(1),
  end_time: z.union([z.string().min(1), z.literal(""), z.null()])
    .transform((v) => (v ? v : null)).optional(),
  status: z.enum(["agendado", "concluido", "cancelado"]).optional(),
};
const createSchema = z.object(fields);
const updateSchema = z.object({ id: z.string().uuid(), ...fields });

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("calendar_events")
      .select("*, client:clients(id,name), project:projects(id,name), campaign:wa_campaigns(id,name,status,scheduled_at)")
      .order("start_time", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .select("*, campaign:wa_campaigns(id,name,status,scheduled_at)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .insert({ ...data, created_by: context.userId })
      .select().single();
    if (error) throw error;
    return row;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase.from("calendar_events").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return row;
  });

export const linkEventToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event_id: z.string().uuid(), campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("calendar_events")
      .update({ campaign_id: data.campaign_id, status: "agendado" })
      .eq("id", data.event_id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("calendar_events").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------- Google Calendar (one-way sync via connector gateway) --------
const GCAL_BASE = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

async function gcalFetch(path: string, init: RequestInit = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gcalKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !gcalKey) {
    throw new Error("Google Calendar não está conectado. Conecte o Google Calendar em Conectores.");
  }
  const res = await fetch(`${GCAL_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gcalKey,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar (${res.status}): ${text}`);
  }
  return res.json();
}

export const syncEventToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), calendar_id: z.string().default("primary") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: ev, error } = await context.supabase
      .from("calendar_events")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!ev) throw new Error("Evento não encontrado");

    const body: any = {
      summary: ev.title,
      description: ev.description ?? undefined,
      start: { dateTime: new Date(ev.start_time).toISOString() },
      end: {
        dateTime: new Date(ev.end_time ?? new Date(new Date(ev.start_time).getTime() + 60 * 60 * 1000)).toISOString(),
      },
    };

    const calId = encodeURIComponent(data.calendar_id);
    let googleEvent: any;
    if (ev.google_event_id && ev.google_calendar_id === data.calendar_id) {
      googleEvent = await gcalFetch(`/calendars/${calId}/events/${ev.google_event_id}`, {
        method: "PATCH", body: JSON.stringify(body),
      });
    } else {
      googleEvent = await gcalFetch(`/calendars/${calId}/events`, {
        method: "POST", body: JSON.stringify(body),
      });
    }

    await context.supabase.from("calendar_events").update({
      google_event_id: googleEvent.id,
      google_calendar_id: data.calendar_id,
      google_synced_at: new Date().toISOString(),
    }).eq("id", ev.id);

    return { ok: true, google_event_id: googleEvent.id, html_link: googleEvent.htmlLink };
  });

export const googleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return { connected: !!(process.env.LOVABLE_API_KEY && process.env.GOOGLE_CALENDAR_API_KEY) };
  });
