import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleEnum = z.enum(["owner", "admin", "operator", "viewer"]);

const KeywordRuleSchema = z.object({
  pattern: z.string().min(1).max(200),
  tags: z.array(z.string().min(1).max(48)).max(10).default([]),
  assign_to: z.string().uuid().nullish(),
});

async function primaryWorkspace(supabase: any, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces:workspaces(created_at)")
    .eq("user_id", userId)
    .order("workspaces(created_at)", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ws = (data as any)?.workspace_id;
  if (!ws) throw new Error("Sem workspace vinculado");
  return { workspace_id: ws as string, role: (data as any)?.role as string };
}

export const getAttendanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspace_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { workspace_id: wsId, role } = data.workspace_id
      ? { workspace_id: data.workspace_id, role: "" as string }
      : await primaryWorkspace(supabase, userId);

    const { data: row } = await supabase
      .from("wa_attendance_settings")
      .select("*")
      .eq("workspace_id", wsId)
      .maybeSingle();

    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", wsId);

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    let profiles: any[] = [];
    if (memberIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberIds);
      profiles = profs ?? [];
    }
    const agents = (members ?? []).map((m: any) => {
      const p = profiles.find((x) => x.id === m.user_id);
      return {
        user_id: m.user_id,
        role: m.role,
        name: p?.full_name ?? null,
        email: p?.email ?? null,
      };
    });

    return {
      workspace_id: wsId,
      can_edit: role === "owner" || role === "admin",
      settings:
        row ?? {
          workspace_id: wsId,
          round_robin_enabled: false,
          agent_roles: ["owner", "admin", "operator"],
          sla_first_response_minutes: 15,
          keyword_rules: [],
          notify_on_new_conversation: true,
          notify_on_sla_breach: true,
          auto_reply_enabled: false,
          auto_reply_text: "",
          auto_reply_cooldown_minutes: 60,
          auto_reply_cta_enabled: false,
          auto_reply_cta_button_text: "",
          auto_reply_cta_url: "",
        },
      agents,
    };
  });

export const updateAttendanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        workspace_id: z.string().uuid().optional(),
        round_robin_enabled: z.boolean(),
        agent_roles: z.array(RoleEnum).min(1),
        sla_first_response_minutes: z.number().int().min(1).max(1440),
        keyword_rules: z.array(KeywordRuleSchema).max(50),
        notify_on_new_conversation: z.boolean(),
        notify_on_sla_breach: z.boolean(),
        auto_reply_enabled: z.boolean().default(false),
        auto_reply_text: z.string().max(2000).default(""),
        auto_reply_cooldown_minutes: z.number().int().min(1).max(10080).default(60),
        auto_reply_cta_enabled: z.boolean().default(false),
        auto_reply_cta_button_text: z.string().max(20).default(""),
        auto_reply_cta_url: z.string().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { workspace_id: wsId, role } = data.workspace_id
      ? await (async () => {
          const { data: m } = await supabase
            .from("workspace_members")
            .select("role")
            .eq("workspace_id", data.workspace_id!)
            .eq("user_id", userId)
            .maybeSingle();
          if (!m) throw new Error("Sem permissão");
          return { workspace_id: data.workspace_id!, role: (m as any).role as string };
        })()
      : await primaryWorkspace(supabase, userId);

    if (role !== "owner" && role !== "admin") {
      throw new Error("Somente owner/admin podem editar configurações de atendimento.");
    }

    const { data: row, error } = await supabase
      .from("wa_attendance_settings")
      .upsert(
        {
          workspace_id: wsId,
          round_robin_enabled: data.round_robin_enabled,
          agent_roles: data.agent_roles,
          sla_first_response_minutes: data.sla_first_response_minutes,
          keyword_rules: data.keyword_rules,
          notify_on_new_conversation: data.notify_on_new_conversation,
          notify_on_sla_breach: data.notify_on_sla_breach,
          auto_reply_enabled: data.auto_reply_enabled,
          auto_reply_text: data.auto_reply_text,
          auto_reply_cooldown_minutes: data.auto_reply_cooldown_minutes,
          auto_reply_cta_enabled: data.auto_reply_cta_enabled,
          auto_reply_cta_button_text: data.auto_reply_cta_button_text,
          auto_reply_cta_url: data.auto_reply_cta_url,
        },
        { onConflict: "workspace_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { settings: row };
  });
