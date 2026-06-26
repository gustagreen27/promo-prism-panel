import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "./slugify";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).optional(),
  destination_url: z.string().trim().url().max(2048),
});

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: campaigns, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = campaigns?.map((c) => c.id) ?? [];
    const counts: Record<string, { total: number; unique: number }> = {};
    if (ids.length) {
      const { data: clicks } = await supabaseAdmin
        .from("campaign_clicks")
        .select("campaign_id, ip")
        .in("campaign_id", ids);
      for (const row of clicks ?? []) {
        const k = row.campaign_id as string;
        if (!counts[k]) counts[k] = { total: 0, unique: 0 };
        counts[k].total += 1;
      }
      // unique ips per campaign
      const seen: Record<string, Set<string>> = {};
      for (const row of clicks ?? []) {
        const k = row.campaign_id as string;
        if (!seen[k]) seen[k] = new Set();
        if (row.ip) seen[k].add(row.ip as string);
      }
      for (const k of Object.keys(seen)) counts[k].unique = seen[k].size;
    }

    return (campaigns ?? []).map((c) => ({
      ...c,
      total_clicks: counts[c.id]?.total ?? 0,
      unique_clicks: counts[c.id]?.unique ?? 0,
    }));
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const baseSlug = slugify(data.slug || data.name);
    if (!baseSlug) throw new Error("Slug inválido");

    // ensure uniqueness
    let slug = baseSlug;
    let i = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      i += 1;
      slug = `${baseSlug}-${i}`;
    }

    const { data: created, error } = await supabaseAdmin
      .from("campaigns")
      .insert({
        name: data.name,
        slug,
        destination_url: data.destination_url,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        destination_url: z.string().trim().url().max(2048).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { id, ...patch } = data;
    const { data: updated, error } = await supabaseAdmin
      .from("campaigns")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  });

export const getCampaignAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: campaign, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (cErr) throw cErr;

    const { data: clicks, error: clErr } = await supabaseAdmin
      .from("campaign_clicks")
      .select("*")
      .eq("campaign_id", data.id)
      .order("clicked_at", { ascending: false })
      .limit(5000);
    if (clErr) throw clErr;

    return { campaign, clicks: clicks ?? [] };
  });
