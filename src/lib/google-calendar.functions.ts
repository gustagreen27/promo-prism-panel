// Integração Google Calendar (per-workspace, OAuth 2.0 offline).
// Requer secrets GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import crypto from "node:crypto";

const SCOPES = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

function siteUrl() {
  return process.env.SITE_URL
    ?? process.env.VITE_SITE_URL
    ?? "https://promo-prism-panel.lovable.app";
}
function redirectUri() {
  return `${siteUrl()}/api/public/google/oauth-callback`;
}

export function signState(workspaceId: string, userId: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-signing";
  const payload = `${workspaceId}.${userId}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}
export function verifyState(state: string): { workspaceId: string; userId: string } | null {
  try {
    const [b64, sig] = state.split(".");
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-signing";
    const payload = Buffer.from(b64, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
    if (sig !== expected) return null;
    const [workspaceId, userId, tsStr] = payload.split(".");
    if (Date.now() - Number(tsStr) > 15 * 60 * 1000) return null;
    return { workspaceId, userId };
  } catch { return null; }
}

async function assertWorkspaceOwnerOrAdmin(supabase: any, userId: string, workspaceId: string) {
  const { data } = await supabase.rpc("has_workspace_role", { _ws: workspaceId, _user: userId, _roles: ["owner", "admin"] });
  if (!data) throw new Error("Somente owners/admins podem gerenciar a integração.");
}

export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceOwnerOrAdmin(context.supabase, context.userId, data.workspace_id);
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID não configurado. Adicione o secret nas configurações do backend.");
    const state = signState(data.workspace_id, context.userId);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return { url: url.toString() };
  });

export const getGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_workspace_member", { _ws: data.workspace_id, _user: context.userId });
    if (!member) throw new Error("Sem acesso a este workspace");
    const { data: row } = await context.supabase
      .from("workspace_google_calendar")
      .select("id,google_email,calendar_id,calendar_name,auto_sync,connected_at,token_expires_at")
      .eq("workspace_id", data.workspace_id)
      .maybeSingle();
    return row;
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceOwnerOrAdmin(context.supabase, context.userId, data.workspace_id);
    await context.supabase.from("workspace_google_calendar").delete().eq("workspace_id", data.workspace_id);
    return { ok: true };
  });

export const setGoogleCalendarPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspace_id: z.string().uuid(),
    calendar_id: z.string().optional(),
    auto_sync: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceOwnerOrAdmin(context.supabase, context.userId, data.workspace_id);
    const patch: any = {};
    if (data.calendar_id) patch.calendar_id = data.calendar_id;
    if (typeof data.auto_sync === "boolean") patch.auto_sync = data.auto_sync;
    await context.supabase.from("workspace_google_calendar").update(patch).eq("workspace_id", data.workspace_id);
    return { ok: true };
  });

export const listGoogleCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceOwnerOrAdmin(context.supabase, context.userId, data.workspace_id);
    const token = await getFreshAccessTokenForWorkspace(data.workspace_id);
    if (!token) throw new Error("Google Calendar não conectado.");
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Erro Google Calendar: ${res.status}`);
    const body = await res.json();
    return (body.items ?? []).map((c: any) => ({ id: c.id, summary: c.summary, primary: !!c.primary }));
  });

// ---- Sync manual ----
export const syncCampaignToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: camp, error } = await context.supabase
      .from("wa_campaigns").select("*").eq("id", data.campaign_id).maybeSingle();
    if (error || !camp) throw new Error("Campanha não encontrada");
    if (!camp.workspace_id) throw new Error("Campanha sem workspace");
    const { data: member } = await context.supabase.rpc("is_workspace_member", { _ws: camp.workspace_id as string, _user: context.userId });
    if (!member) throw new Error("Sem acesso");
    const r = await syncCampaignToGoogleInternal(camp.workspace_id as string, camp.id);
    return r;
  });

// ============================================================
// Helpers server-only (usados por outros server fns)
// ============================================================

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function getFreshAccessTokenForWorkspace(workspaceId: string): Promise<string | null> {
  const admin = await adminClient();
  const { data: row } = await admin.from("workspace_google_calendar").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (!row) return null;
  const exp = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (row.access_token && exp > Date.now() + 60_000) return row.access_token;
  if (!row.refresh_token) return null;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_OAUTH_* secrets ausentes");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const expiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString();
  await admin.from("workspace_google_calendar").update({
    access_token: body.access_token,
    token_expires_at: expiresAt,
  }).eq("workspace_id", workspaceId);
  return body.access_token as string;
}

function buildEventBody(camp: any) {
  const start = new Date(camp.scheduled_at ?? camp.started_at ?? new Date());
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const link = `${siteUrl()}/painel/campanhas`;
  return {
    summary: `📣 ${camp.name}`,
    description: [
      `Campanha: ${camp.name}`,
      `Status: ${camp.status}`,
      camp.total_recipients ? `Contatos: ${camp.total_recipients}` : null,
      `Ver: ${link}`,
    ].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

export async function syncCampaignToGoogleInternal(workspaceId: string, campaignId: string) {
  const admin = await adminClient();
  const { data: conn } = await admin.from("workspace_google_calendar").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (!conn || !conn.auto_sync) return { skipped: true };
  const token = await getFreshAccessTokenForWorkspace(workspaceId);
  if (!token) return { skipped: true, reason: "no_token" };
  const { data: camp } = await admin.from("wa_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!camp) return { skipped: true };
  if (!camp.scheduled_at) return { skipped: true, reason: "no_schedule" };

  const calId = encodeURIComponent(conn.calendar_id || "primary");
  const body = buildEventBody(camp);
  const cancelled = camp.status === "cancelled";
  let res: Response;
  if (camp.google_event_id && cancelled) {
    res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${camp.google_event_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await admin.from("wa_campaigns").update({ google_event_id: null, google_calendar_id: null, google_synced_at: new Date().toISOString() }).eq("id", camp.id);
    return { deleted: true };
  }
  if (camp.google_event_id) {
    res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${camp.google_event_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw new Error(`Google Calendar (${res.status}): ${await res.text()}`);
  const ev = await res.json();
  await admin.from("wa_campaigns").update({
    google_event_id: ev.id,
    google_calendar_id: conn.calendar_id || "primary",
    google_synced_at: new Date().toISOString(),
  }).eq("id", camp.id);
  return { ok: true, html_link: ev.htmlLink };
}

export async function deleteCampaignFromGoogleInternal(workspaceId: string, campaignId: string) {
  const admin = await adminClient();
  const { data: camp } = await admin.from("wa_campaigns").select("google_event_id,google_calendar_id").eq("id", campaignId).maybeSingle();
  if (!camp?.google_event_id) return { skipped: true };
  const token = await getFreshAccessTokenForWorkspace(workspaceId);
  if (!token) return { skipped: true };
  const calId = encodeURIComponent(camp.google_calendar_id || "primary");
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${camp.google_event_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await admin.from("wa_campaigns").update({ google_event_id: null, google_calendar_id: null, google_synced_at: new Date().toISOString() }).eq("id", campaignId);
  return { ok: true };
}
