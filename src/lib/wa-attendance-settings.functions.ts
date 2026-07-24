import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleEnum = z.enum(["owner", "admin", "operator", "viewer"]);

const KeywordRuleSchema = z.object({
  pattern: z.string().min(1).max(200),
  tags: z.array(z.string().min(1).max(48)).max(10).default([]),
  assign_to: z.string().uuid().nullish(),
});

async function assertWsMember(supabase: any, userId: string, wsId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", wsId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Workspace inválido ou sem permissão");
  return data;
}

export const getAttendanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) =>
    z.object({ workspace_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertWsMember(supabase, userId, data.workspace_id);
    const { data: row } = await supabase
      .from("wa_attendance_settings")
      .select("*")
      .eq("workspace_id", data.workspace_id)
      .maybeSingle();

    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", data.workspace_id);

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
      settings:
        row ?? {
          workspace_id: data.workspace_id,
          round_robin_enabled: false,
          agent_roles: ["owner", "admin", "operator"],
          sla_first_response_minutes: 15,
          keyword_rules: [],
          notify_on_new_conversation: true,
          notify_on_sla_breach: true,
        },
      agents,
    };
  });

export const updateAttendanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        round_robin_enabled: z.boolean(),
        agent_roles: z.array(RoleEnum).min(1),
        sla_first_response_minutes: z.number().int().min(1).max(1440),
        keyword_rules: z.array(KeywordRuleSchema).max(50),
        notify_on_new_conversation: z.boolean(),
        notify_on_sla_breach: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const m = await assertWsMember(supabase, userId, data.workspace_id);
    if (!["owner", "admin"].includes(m.role)) {
      throw new Error("Somente owner/admin podem editar configurações de atendimento.");
    }
    const { data: row, error } = await supabase
      .from("wa_attendance_settings")
      .upsert(
        {
          workspace_id: data.workspace_id,
          round_robin_enabled: data.round_robin_enabled,
          agent_roles: data.agent_roles,
          sla_first_response_minutes: data.sla_first_response_minutes,
          keyword_rules: data.keyword_rules,
          notify_on_new_conversation: data.notify_on_new_conversation,
          notify_on_sla_breach: data.notify_on_sla_breach,
        },
        { onConflict: "workspace_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { settings: row };
  });
