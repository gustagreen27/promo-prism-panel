import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional();

const fields = {
  name: z.string().trim().min(1).max(160),
  client_id: optUuid,
  project_id: optUuid,
  connection_id: optUuid,
  template_id: optUuid,
  template_variables: z.any().optional(),
  list_id: optUuid,
  tag_filters: z.array(z.string().uuid()).optional(),
  scheduled_at: z.union([z.string(), z.null()]).optional(),
  send_rate_per_min: z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null || v === "" ? 30 : Number(v))).optional(),
  notes: z.string().max(2000).optional().nullable(),
  participants: z.array(z.enum(["gustavo", "cayo"])).optional().default([]),
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listWaCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("wa_campaigns")
      .select("*, client:clients(id,name), project:projects(id,name), template:whatsapp_templates(id,name,language), connection:whatsapp_connections(id,name,display_phone)")
      // Demandas de clientes só entram em /admin/disparos depois de aprovadas.
      // Enquanto estiverem "pending", vivem exclusivamente em /admin/demandas.
      .or("approval_status.is.null,approval_status.neq.pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as any[];
    const campaignIds = rows.map((r) => r.id).filter(Boolean) as string[];
    const clicksByCampaign: Record<string, number> = {};
    if (campaignIds.length) {
      const { data: clickRows } = await context.supabase.rpc("wa_count_dispatch_clicks" as any, {
        _campaign_ids: campaignIds,
        _from: null,
        _to: null,
      });
      for (const c of (clickRows ?? []) as any[]) {
        const k = c.wa_campaign_id as string;
        clicksByCampaign[k] = Number(c.clicks ?? 0) || 0;
      }
    }
    return rows.map((r) => ({ ...r, clicks_count: clicksByCampaign[r.id] ?? 0 }));
  });

export const getWaCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("wa_campaigns")
      .select("*, client:clients(id,name), project:projects(id,name), template:whatsapp_templates(*), connection:whatsapp_connections(id,name,display_phone,phone,phone_number_id)")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return row;
  });

export const createWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object(fields).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("wa_campaigns")
      // Campanhas criadas pelo próprio admin em /admin/disparos não passam pela fila.
      .insert({ approval_status: "not_required", ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...fields }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("wa_campaigns")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Se ainda houver reserva de saldo ativa, libera antes de excluir para não travar o wallet.
    const { data: camp } = await context.supabase
      .from("wa_campaigns")
      .select("id, status, reservation_id")
      .eq("id", data.id)
      .maybeSingle();
    if (camp?.reservation_id) {
      try {
        await context.supabase.rpc("wallet_release_reservation" as any, {
          _reservation_id: camp.reservation_id,
        });
      } catch { /* segue exclusão mesmo se já estiver liberada */ }
    }
    // Cascata do FK remove recipients / timeline / audit_log automaticamente.
    const { error } = await context.supabase.from("wa_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const buildRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp, error } = await context.supabase
      .from("wa_campaigns")
      .select("id, list_id")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    if (!camp.list_id) throw new Error("Selecione uma lista de contatos.");

    // Enfileira via RPC server-side (INSERT..SELECT em uma única query),
    // suporta listas de 100k+ sem estourar o tempo do server function.
    const { data: total, error: buildErr } = await context.supabase.rpc(
      "wa_build_recipients" as any,
      { _campaign_id: data.id, _list_id: camp.list_id }
    );
    if (buildErr) throw buildErr;
    return { total: Number(total ?? 0) };
  });

/** Pré-check obrigatório: número CONNECTED, qualidade, WABA, template, token, limites e restrições. */
export const preflightWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runCampaignPreflight } = await import("@/lib/meta/wa-preflight.server");
    return await runCampaignPreflight(supabaseAdmin, data.id);
  });

/** Pré-check de uma seleção avulsa (número + template) no wizard, antes de criar a campanha. */
export const preflightSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connection_id: z.string().uuid().nullable().optional(),
      template_id: z.string().uuid().nullable().optional(),
      total_recipients: z.number().int().min(0).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runSelectionPreflight } = await import("@/lib/meta/wa-preflight.server");
    return await runSelectionPreflight(supabaseAdmin, {
      connection_id: data.connection_id ?? null,
      template_id: data.template_id ?? null,
      total_recipients: data.total_recipients ?? 0,
      require_queue: false,
    });
  });



/** Libera manualmente uma campanha travada por erro crítico (ex.: 131031). */
export const clearCampaignFatalLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("wa_campaigns")
      .update({ fatal_locked: false, fatal_error_code: null, fatal_error_message: null, fatal_locked_at: null })
      .eq("id", data.id);
    return { ok: true };
  });

export const startWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), confirm_warnings: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp } = await context.supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");
    {
      const { assertCampaignApproved } = await import("@/lib/campaign-approval.server");
      await assertCampaignApproved(context.supabase, data.id, { userId: context.userId });
    }
    if (!camp.connection_id || !camp.template_id) throw new Error("Configure número e template antes de iniciar.");
    if (!camp.total_recipients) throw new Error("Gere a fila de destinatários antes de iniciar.");
    if ((camp as any).fatal_locked) {
      throw new Error(
        `Campanha travada por erro crítico ${(camp as any).fatal_error_code ?? ""}: ${(camp as any).fatal_error_message ?? "conta bloqueada pela Meta"}. Troque de WABA/número ou libere manualmente.`,
      );
    }

    // Pré-check obrigatório de saúde da conta antes de liberar o disparo.
    let preflight: any = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { runCampaignPreflight } = await import("@/lib/meta/wa-preflight.server");
      preflight = await runCampaignPreflight(supabaseAdmin, data.id);
    } catch {
      // Falha de consulta não bloqueia (fail-open) — o runner refaz a checagem.
    }
    if (preflight?.verdict === "red") {
      const fails = (preflight.checks as any[]).filter((c) => c.status === "fail").map((c) => `${c.label}: ${c.detail}`);
      throw new Error(`⛔ Disparo bloqueado pelo pré-check.\n${fails.join("\n")}`);
    }
    if (preflight?.verdict === "yellow" && !data.confirm_warnings) {
      const warns = (preflight.checks as any[]).filter((c) => c.status === "warn").map((c) => `${c.label}: ${c.detail}`);
      throw new Error(`NEEDS_CONFIRMATION::⚠️ Qualidade média — confirme para continuar.\n${warns.join("\n")}`);
    }

    // Admin dispatch bypasses stock — não há débito automático de estoque neste fluxo.
    await context.supabase
      .from("wa_campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", data.id);
    try {
      const url = new URL("/api/public/whatsapp/queue-tick", process.env.SUPABASE_URL?.replace(".supabase.co", ".lovable.app") ?? "https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app");
      fetch(url.toString(), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});
    } catch {}
    return { ok: true, preflight };
  });


export const scheduleWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), scheduled_at: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const when = new Date(data.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new Error("Data/hora inválida.");
    if (when.getTime() < Date.now() - 60_000) throw new Error("A data/hora deve ser futura.");

    const { data: camp } = await context.supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");
    if (!camp.connection_id || !camp.template_id) throw new Error("Configure número e template antes de agendar.");
    if (!camp.total_recipients) throw new Error("Gere a fila de destinatários antes de agendar.");
    // Admin schedule bypasses stock — dispatches administrativos não descontam estoque neste fluxo.


    const { error } = await context.supabase
      .from("wa_campaigns")
      .update({ status: "scheduled", scheduled_at: when.toISOString(), started_at: null, finished_at: null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true, scheduled_at: when.toISOString() };
  });

export const unscheduleWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("wa_campaigns")
      .update({ status: "draft", scheduled_at: null })
      .eq("id", data.id)
      .eq("status", "scheduled");
    if (error) throw error;
    return { ok: true };
  });

// Cria uma campanha agendada a partir do fluxo "disparo rápido" da tela /admin/disparos.
// Persiste tudo no backend (números, template, destinatários, mapeamentos) e o cron promove no horário.
export const scheduleQuickSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1).optional(),
      connection_id: z.string().uuid(),
      template_id: z.string().uuid(),
      scheduled_at: z.string().min(1),
      recipients: z.array(z.object({
        phone: z.string().min(4),
        name: z.string().optional().nullable(),
        extras: z.record(z.string()).optional().nullable(),
      })),

      body_mapping: z.record(z.string()).optional().default({}),
      button_url_mapping: z.record(z.string()).optional().default({}),
      header_media_url: z.string().optional().nullable(),
      header_text_param: z.string().optional().nullable(),
      send_rate_per_min: z.number().int().min(1).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const when = new Date(data.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new Error("Data/hora inválida.");
    if (when.getTime() < Date.now() - 60_000) throw new Error("A data/hora deve ser futura.");

    // Monta template_variables no nível da campanha (compartilhado a todos os destinatários).
    const templateVars: Record<string, string> = { ...(data.body_mapping ?? {}) };
    const buttonUrlMapping: Record<string, string> = { ...(data.button_url_mapping ?? {}) };
    if (data.header_media_url) templateVars._header_image_url = data.header_media_url;
    if (data.header_text_param) templateVars._header_text_param = data.header_text_param;

    const defaultName = data.name?.trim() ||
      `Disparo agendado ${when.toLocaleString("pt-BR")}`;

    // Dedupe destinatários por telefone
    const seen = new Set<string>();
    const uniqueRecipients = data.recipients.filter((r) => {
      const p = r.phone.replace(/\D/g, "");
      if (!p || seen.has(p)) return false;
      seen.add(p);
      return true;
    });

    const { data: campRow, error: cErr } = await context.supabase
      .from("wa_campaigns")
      .insert({
        name: defaultName,
        connection_id: data.connection_id,
        template_id: data.template_id,
        template_variables: templateVars,
        variables_mapping: data.body_mapping ?? null,
        button_url_mapping: Object.keys(buttonUrlMapping).length ? buttonUrlMapping : null,
        status: "scheduled",
        scheduled_at: when.toISOString(),
        send_rate_per_min: data.send_rate_per_min ?? 30,
        total_recipients: uniqueRecipients.length,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;


    const rows = uniqueRecipients.map((r) => {
      const vars: Record<string, string> = {};
      if (r.name) vars.nome = r.name;
      if (r.extras) {
        for (const [k, v] of Object.entries(r.extras)) {
          if (v === null || v === undefined || String(v).trim() === "") continue;
          vars[k] = String(v);
          vars[k.toLowerCase()] = String(v);
        }
      }
      return {
        campaign_id: campRow.id,
        phone: r.phone.replace(/\D/g, ""),
        variables: vars,
        status: "pending" as const,
      };
    });

    for (let i = 0; i < rows.length; i += 1000) {
      const { error: rErr } = await context.supabase
        .from("campaign_recipients")
        .insert(rows.slice(i, i + 1000));
      if (rErr) throw rErr;
    }

    return { ok: true, id: campRow.id, scheduled_at: when.toISOString(), total: uniqueRecipients.length };
  });

export const pauseWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("wa_campaigns").update({ status: "paused" }).eq("id", data.id);
    return { ok: true };
  });

export const cancelWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("wa_campaigns")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.id);
    await context.supabase
      .from("campaign_recipients")
      .update({ status: "cancelled" })
      .eq("campaign_id", data.id)
      .eq("status", "pending");
    return { ok: true };
  });

export const campaignReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp } = await context.supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    const { data: rec } = await context.supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", data.id);
    const counts: Record<string, number> = {};
    for (const r of rec ?? []) counts[(r as any).status] = (counts[(r as any).status] || 0) + 1;
    return { campaign: camp, counts, total: (rec ?? []).length };
  });

// Public availability helper (no-stock check from UI)
export const availableStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ client_id: optUuid, project_id: optUuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: avail } = await context.supabase.rpc("wa_available_stock" as any, {
      _client_id: data.client_id,
      _project_id: data.project_id,
    });
    return Number(avail ?? 0);
  });

/**
 * Troca número/template (e demais parâmetros) de uma campanha pausada/erro/finalizada,
 * preservando envios já processados. Reenfileira apenas destinatários "processing"
 * sem wamid; contatos já enviados/entregues/lidos/falhos permanecem intactos.
 * Registra a mudança em campaign_timeline (event_type=config_swap) e opcionalmente
 * retoma a campanha (resume=true) se houver pendentes.
 */
export const swapCampaignConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      connection_id: z.string().uuid().nullish(),
      template_id: z.string().uuid().nullish(),
      template_variables: z.record(z.string()).nullish(),
      variables_mapping: z.record(z.string()).nullish(),
      button_url_mapping: z.record(z.string()).nullish(),
      send_rate_per_min: z.number().int().min(1).nullish(),
      resume: z.boolean().optional().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context as any;

    const { data: camp, error: cErr } = await supabase
      .from("wa_campaigns")
      .select("id, status, connection_id, template_id, template_variables, variables_mapping, button_url_mapping, send_rate_per_min, connection:whatsapp_connections(id,name,display_phone,phone,phone_number_id), template:whatsapp_templates(id,name,status,language)")
      .eq("id", data.id)
      .single();
    if (cErr) throw cErr;
    if (!camp) throw new Error("Campanha não encontrada");

    const allowed = ["paused", "error", "failed", "draft", "completed", "partial"];
    if (!allowed.includes(String(camp.status))) {
      throw new Error(`Só é possível trocar número/template com a campanha pausada, com erro ou finalizada. Status atual: ${camp.status}`);
    }

    const newConnectionId = (data.connection_id ?? camp.connection_id) as string | null;
    const newTemplateId = (data.template_id ?? camp.template_id) as string | null;
    if (!newConnectionId) throw new Error("Selecione um número de WhatsApp.");
    if (!newTemplateId) throw new Error("Selecione um template.");

    // Valida template
    const { data: tpl, error: tErr } = await supabase
      .from("whatsapp_templates")
      .select("id,name,status,language,connection_id,waba_ref_id,body,header_type,buttons")
      .eq("id", newTemplateId)
      .single();
    if (tErr) throw tErr;
    if (!tpl) throw new Error("Template inválido.");
    const tst = String(tpl.status ?? "").toLowerCase();
    if (!["approved", "aprovado", "active", "ativo"].includes(tst)) {
      throw new Error(`Template selecionado não está ativo (status: ${tpl.status}).`);
    }
    // Valida conexão
    const { data: conn, error: connErr } = await supabase
      .from("whatsapp_connections")
      .select("id,name,display_phone,phone,phone_number_id,status,waba_ref_id")
      .eq("id", newConnectionId)
      .single();
    if (connErr) throw connErr;
    if (!conn) throw new Error("Número não encontrado.");
    const cst = String(conn.status ?? "").toLowerCase();
    if (!["ativo", "ativa", "active", "connected"].includes(cst)) {
      throw new Error(`Número selecionado não está ativo (status: ${conn.status}).`);
    }
    if (!conn.phone_number_id) throw new Error("Número selecionado não tem phone_number_id configurado.");

    // Templates são sincronizados por WABA: compatível se pertencer à mesma WABA
    // (ou, na ausência de WABA, à própria conexão).
    const sameWaba = tpl.waba_ref_id && conn.waba_ref_id && tpl.waba_ref_id === conn.waba_ref_id;
    if (!sameWaba && tpl.connection_id && tpl.connection_id !== newConnectionId) {
      throw new Error("Template não é compatível com o número selecionado.");
    }

    // Se o template mudou e tem variáveis, exige mapeamento novo
    const templateChanged = newTemplateId !== camp.template_id;
    if (templateChanged) {
      const body = String(tpl.body ?? "");
      const bodyVarNums = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((m) => Number(m[1]));
      const providedMap = (data.template_variables ?? data.variables_mapping ?? {}) as Record<string, string>;
      for (const n of bodyVarNums) {
        const v = providedMap[String(n)];
        if (!v || !String(v).trim()) {
          throw new Error(`O novo template exige a variável {{${n}}} — configure o novo mapeamento antes de continuar.`);
        }
      }
      const urlButton = (Array.isArray(tpl.buttons) ? tpl.buttons : []).find(
        (b: any) => String(b?.type ?? "").toLowerCase() === "url" && typeof b?.url === "string",
      ) as any;
      if (urlButton?.url) {
        const urlVarNums = Array.from(String(urlButton.url).matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((m) => Number(m[1]));
        const btnMap = (data.button_url_mapping ?? {}) as Record<string, string>;
        for (const n of urlVarNums) {
          if (!btnMap[String(n)] || !String(btnMap[String(n)]).trim()) {
            throw new Error(`O botão do novo template exige a variável {{${n}}} na URL — configure o novo mapeamento.`);
          }
        }
      }
    }

    // Monta patch
    const patch: Record<string, any> = {
      connection_id: newConnectionId,
      template_id: newTemplateId,
      last_error: null,
      pause_reason: null,
    };
    if (data.template_variables !== undefined) patch.template_variables = data.template_variables ?? {};
    if (data.variables_mapping !== undefined) patch.variables_mapping = data.variables_mapping ?? {};
    if (data.button_url_mapping !== undefined) patch.button_url_mapping = data.button_url_mapping ?? {};
    if (data.send_rate_per_min != null) patch.send_rate_per_min = data.send_rate_per_min;

    const { error: upErr } = await supabase.from("wa_campaigns").update(patch).eq("id", data.id);
    if (upErr) throw upErr;

    // Reseta processing órfãos → pending
    const { data: resetRows } = await supabase
      .from("campaign_recipients")
      .update({ status: "pending", failed_reason: null, error_code: null })
      .eq("campaign_id", data.id)
      .eq("status", "processing")
      .is("meta_message_id", null)
      .select("id");
    const reenqueued = resetRows?.length ?? 0;

    // Libera lease
    await supabase
      .from("wa_campaigns")
      .update({ worker_lease_id: null, worker_lease_until: null })
      .eq("id", data.id);

    // Conta pendentes reais
    const { count: pendingCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", data.id)
      .eq("status", "pending");

    // Timeline
    const fromLabel = (camp as any).connection?.display_phone ?? (camp as any).connection?.phone ?? camp.connection_id ?? "—";
    const toLabel = conn.display_phone ?? conn.phone ?? newConnectionId;
    const fromTpl = (camp as any).template?.name ?? camp.template_id ?? "—";
    await supabase.from("campaign_timeline").insert({
      campaign_id: data.id,
      event_type: "config_swap",
      message: `Configuração trocada — número: ${fromLabel} → ${toLabel} · template: ${fromTpl} → ${tpl.name}`,
      actor_id: userId,
      payload: {
        from: {
          connection_id: camp.connection_id,
          template_id: camp.template_id,
          connection_phone: (camp as any).connection?.display_phone ?? (camp as any).connection?.phone ?? null,
          phone_number_id: (camp as any).connection?.phone_number_id ?? null,
          template_name: (camp as any).template?.name ?? null,
          template_variables: (camp as any).template_variables ?? null,
          variables_mapping: (camp as any).variables_mapping ?? null,
          button_url_mapping: (camp as any).button_url_mapping ?? null,
          send_rate_per_min: camp.send_rate_per_min ?? null,
        },
        to: {
          connection_id: newConnectionId,
          template_id: newTemplateId,
          connection_phone: conn.display_phone ?? conn.phone ?? null,
          phone_number_id: conn.phone_number_id,
          template_name: tpl.name,
          template_variables: patch.template_variables ?? undefined,
          variables_mapping: patch.variables_mapping ?? undefined,
          button_url_mapping: patch.button_url_mapping ?? undefined,
          send_rate_per_min: patch.send_rate_per_min ?? camp.send_rate_per_min ?? null,
        },
        reenqueued_processing: reenqueued,
        pending_after: pendingCount ?? 0,
      },
    });

    // Retoma se pedido
    let newStatus: string | null = null;
    if (data.resume !== false && (pendingCount ?? 0) > 0) {
      newStatus = "running";
      await supabase
        .from("wa_campaigns")
        .update({
          status: "running",
          paused_at: null,
          finished_at: null,
          resumed_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    }

    await supabase.rpc("wa_recalc_campaign_progress" as any, { _campaign_id: data.id });

    // Dispara tick (fire-and-forget)
    try {
      const base = process.env.SUPABASE_URL?.replace(".supabase.co", ".lovable.app")
        ?? "https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app";
      const url = new URL("/api/public/whatsapp/queue-tick", base);
      fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-tick-source": "config-swap" },
        body: "{}",
      }).catch(() => {});
    } catch {}

    return {
      ok: true,
      reenqueued,
      pending: pendingCount ?? 0,
      status: newStatus ?? camp.status,
    };
  });

/**
 * Ajusta a velocidade de uma campanha ao vivo (sem parar/reiniciar):
 * taxa por minuto, lote por ciclo e jitter. Aplica imediatamente no próximo tick.
 */
export const updateCampaignSpeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      send_rate_per_min: z.number().int().min(1).max(6000),
      batch_size: z.number().int().min(1).max(500).optional(),
      jitter_ms: z.number().int().min(0).max(60000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context as any;
    const { id, ...patch } = data;
    const clean: Record<string, unknown> = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    // O motor de disparo usa rate_per_second (token bucket). Mantemos
    // send_rate_per_min como valor exibido e derivamos o rate real daqui.
    clean.rate_per_second = Math.max(1, Math.ceil(data.send_rate_per_min / 60));
    const { data: row, error } = await supabase
      .from("wa_campaigns")
      .update(clean)
      .eq("id", id)
      .select("id, send_rate_per_min, rate_per_second, batch_size, jitter_ms, connection_id")
      .single();
    if (error) throw error;
    // Teto real do número (bucket global compartilhado por phone_number_id).
    let effective_rate_per_second = row.rate_per_second as number;
    let cap_rate_per_second: number | null = null;
    if (row.connection_id) {
      const { data: conn } = await supabase
        .from("whatsapp_connections")
        .select("global_rate_per_second, maximum_rate_per_second")
        .eq("id", row.connection_id)
        .maybeSingle();
      if (conn) {
        const cap = Math.min(
          Math.max(1, Number((conn as any).global_rate_per_second ?? 80)),
          Math.max(1, Number((conn as any).maximum_rate_per_second ?? 80)),
        );
        cap_rate_per_second = cap;
        effective_rate_per_second = Math.min(effective_rate_per_second, cap);
      }
    }
    const capped = cap_rate_per_second != null && (row.rate_per_second as number) > cap_rate_per_second;

    try {
      await supabase.from("campaign_timeline").insert({
        campaign_id: id,
        event_type: "speed_update",
        message: `Velocidade ajustada: ${row.send_rate_per_min} msg/min (~${effective_rate_per_second} msg/s efetivo) · lote ${row.batch_size ?? "—"} · jitter ${row.jitter_ms ?? 0}ms`,
        metadata: { ...clean, effective_rate_per_second, by: userId },
      });
    } catch { /* timeline é best-effort */ }
    return { ...row, effective_rate_per_second, cap_rate_per_second, capped };

  });

/**
 * Limites de velocidade do número associado à campanha (para alertas na UI).
 */
export const getCampaignSpeedLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context as any;
    const { data: camp } = await supabase
      .from("wa_campaigns")
      .select("connection_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!camp?.connection_id) {
      return { cap_rate_per_second: null as number | null, quality_rating: null, phone_label: null };
    }
    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select("display_phone, phone, global_rate_per_second, maximum_rate_per_second, quality_rating, status")
      .eq("id", camp.connection_id)
      .maybeSingle();
    if (!conn) return { cap_rate_per_second: null as number | null, quality_rating: null, phone_label: null };
    const cap = Math.min(
      Math.max(1, Number((conn as any).global_rate_per_second ?? 80)),
      Math.max(1, Number((conn as any).maximum_rate_per_second ?? 80)),
    );
    return {
      cap_rate_per_second: cap,
      quality_rating: (conn as any).quality_rating ?? null,
      phone_label: (conn as any).display_phone ?? (conn as any).phone ?? null,
      connection_status: (conn as any).status ?? null,
    };
  });


/**
 * Modo Rajada ("tudo de uma vez"): eleva o teto do número e coloca a campanha
 * na velocidade máxima suportada, sem jitter. Depois disso o sistema só coleta
 * os webhooks de status (entregue/lido/falha).
 */
export const setCampaignTurbo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      target_rate_per_second: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: camp, error: campErr } = await supabase
      .from("wa_campaigns")
      .select("id, connection_id, total_recipients")
      .eq("id", data.id)
      .maybeSingle();
    if (campErr) throw campErr;
    if (!camp) throw new Error("Campanha não encontrada");

    const target = data.target_rate_per_second ?? 80;
    let cap = target;
    let phoneLabel: string | null = null;

    if (camp.connection_id) {
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, display_phone, phone, maximum_rate_per_second, global_rate_per_second, global_max_concurrency")
        .eq("id", camp.connection_id)
        .maybeSingle();
      if (conn) {
        phoneLabel = (conn as any).display_phone ?? (conn as any).phone ?? null;
        const maxRate = Math.max(Number((conn as any).maximum_rate_per_second ?? 80), target);
        cap = Math.min(target, maxRate);
        await supabaseAdmin
          .from("whatsapp_connections")
          .update({
            maximum_rate_per_second: maxRate,
            global_rate_per_second: cap,
            global_max_concurrency: Math.max(
              Number((conn as any).global_max_concurrency ?? 200),
              cap * 10,
            ),
          })
          .eq("id", conn.id);
      }
    }

    const batch = Math.max(50, Math.min(500, cap * 5));
    const { data: row, error } = await supabase
      .from("wa_campaigns")
      .update({
        rate_per_second: cap,
        send_rate_per_min: Math.min(6000, cap * 60),
        batch_size: batch,
        jitter_ms: 0,
        max_concurrency: Math.min(1000, cap * 10),
      })
      .eq("id", data.id)
      .select("id, send_rate_per_min, rate_per_second, batch_size, jitter_ms, max_concurrency")
      .single();
    if (error) throw error;

    try {
      await supabase.from("campaign_timeline").insert({
        campaign_id: data.id,
        event_type: "speed_update",
        message: `Modo rajada ativado: ~${cap} msg/s (${cap * 60}/min) · lote ${batch} · sem jitter${phoneLabel ? ` · número ${phoneLabel}` : ""}`,
        metadata: { turbo: true, rate_per_second: cap, by: userId },
      });
    } catch { /* best-effort */ }

    return { ...row, effective_rate_per_second: cap, phone_label: phoneLabel };
  });
