import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type MyContext = {
  authenticated: boolean;
  user_id?: string;
  profile?: {
    id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    cnpj: string | null;
    avatar_url: string | null;
  } | null;
  roles?: string[];
  is_staff?: boolean;
  workspaces?: Array<{
    id: string;
    name: string;
    slug: string | null;
    plan: string;
    status: string;
    blocked_at: string | null;
    block_reason: string | null;
    role: string;
  }>;
  primary_workspace?: {
    id: string;
    name: string;
    slug: string | null;
    plan: string;
    status: string;
    blocked_at: string | null;
    block_reason: string | null;
    role: string;
    is_blocked: boolean;
    wallet: {
      balance_cents: number;
      reserved_cents: number;
      custom_price_cents: number | null;
      custom_minimum_messages: number | null;
    } | null;
    onboarding: Array<{ key: string; done: boolean; done_at: string | null }>;
  } | null;
};

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_context");
    if (error) throw new Error(error.message);
    return (data ?? { authenticated: false }) as unknown as MyContext;
  });

export const markOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; key: string; done: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("onboarding_checklist")
      .update({ done: data.done, done_at: data.done ? new Date().toISOString() : null })
      .eq("workspace_id", data.workspace_id)
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Log auth event — uses anon client so login_failed can be logged before session
export const logAuthEvent = createServerFn({ method: "POST" })
  .inputValidator((d: { type: string; metadata?: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    try {
      const client = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      await client.rpc("log_auth_event", {
        _type: data.type,
        _metadata: (data.metadata ?? {}) as never,
      });
    } catch {
      // best-effort
    }
    return { ok: true };
  });

// Create a workspace for a user who signed up without a company name
export const ensureWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { company_name: string; cnpj?: string; phone?: string }) => d)
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const existing = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", uid)
      .limit(1);
    if (existing.data && existing.data.length > 0) {
      return { workspace_id: existing.data[0].workspace_id };
    }
    const name = data.company_name.trim();
    if (name.length < 2) throw new Error("Nome da empresa inválido");
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `ws-${uid.slice(0, 8)}`;
    let slug = baseSlug;
    const { data: exists } = await context.supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (exists) slug = `${baseSlug}-${uid.slice(0, 6)}`;

    const { data: ws, error } = await context.supabase
      .from("workspaces")
      .insert({ name, slug, plan: "starter", status: "active", owner_id: uid })
      .select("id")
      .single();
    if (error || !ws) throw new Error(error?.message ?? "Falha ao criar workspace");

    await context.supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: uid, role: "owner" });
    await context.supabase.rpc("seed_onboarding_checklist", { _ws: ws.id });

    if (data.cnpj || data.phone) {
      await context.supabase.from("profiles").update({
        cnpj: data.cnpj ?? null,
        phone: data.phone ?? null,
      }).eq("id", uid);
    }
    return { workspace_id: ws.id };
  });

export const getPanelHomeStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) => d)
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [campaigns, recipients] = await Promise.all([
      context.supabase
        .from("wa_campaigns")
        .select("id, status", { count: "exact", head: false })
        .eq("workspace_id", data.workspace_id),
      context.supabase
        .from("campaign_recipients")
        .select("status", { head: false })
        .gte("created_at", since)
        .in("campaign_id", (
          await context.supabase.from("wa_campaigns").select("id").eq("workspace_id", data.workspace_id)
        ).data?.map((c) => c.id) ?? []),
    ]);

    const counts = { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, opt_out: 0 };
    for (const r of recipients.data ?? []) {
      const s = (r as { status: string }).status;
      if (s === "sent" || s === "delivered" || s === "read" || s === "replied") counts.sent++;
      if (s === "delivered" || s === "read" || s === "replied") counts.delivered++;
      if (s === "read" || s === "replied") counts.read++;
      if (s === "replied") counts.replied++;
      if (s === "failed") counts.failed++;
      if (s === "opt_out") counts.opt_out++;
    }
    const active = (campaigns.data ?? []).filter((c) => ["running", "scheduled", "processing"].includes((c as { status: string }).status)).length;
    return {
      total_campaigns: campaigns.data?.length ?? 0,
      active_campaigns: active,
      ...counts,
    };
  });
