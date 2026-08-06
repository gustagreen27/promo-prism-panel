/**
 * Saúde de envio (Messaging & Calling Health Status) — camada server-only.
 *
 * GET /<NODE_ID>?fields=health_status devolve o status agregado
 * (AVAILABLE / LIMITED / BLOCKED) de todas as entidades envolvidas no envio:
 * número, WABA, portfólio de negócios, app e (para templates) o próprio template.
 *
 * Este módulo:
 *  - consulta a Graph API,
 *  - grava o resultado em wa_health_status (cache com "última verificação"),
 *  - registra mudanças de status em wa_health_events (histórico por data/hora),
 *  - dispara notificação ao workspace quando o status muda,
 *  - expõe ensureSendable() para a pré-checagem antes de cada envio.
 */

import { resolveGraphVersion } from "@/lib/meta/graph-version";

export type HealthEntity = {
  entity_type?: string;
  id?: string;
  can_send_message?: string;
  errors?: Array<{ error_code?: number; error_description?: string; possible_solution?: string }>;
  additional_info?: string[];
};

export type HealthSnapshot = {
  ok: boolean;
  node_kind: string;
  node_id: string;
  can_send_message: string | null;
  entities: HealthEntity[];
  errors: Array<{ entity: string | null; error_code?: number; error_description?: string; possible_solution?: string }>;
  additional_info: Array<{ entity: string | null; message: string }>;
  fetch_error: string | null;
  checked_at: string;
  label?: string | null;
  cached?: boolean;
};

const STATUS_ORDER: Record<string, number> = { AVAILABLE: 0, LIMITED: 1, BLOCKED: 2 };

/** Consulta crua na Graph API. */
export async function fetchHealth(
  nodeId: string,
  token: string,
  graphVersion?: string | null,
): Promise<Omit<HealthSnapshot, "node_kind" | "label">> {
  const version = resolveGraphVersion(graphVersion ?? null);
  const base = {
    node_id: nodeId,
    checked_at: new Date().toISOString(),
  };
  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${nodeId}?fields=health_status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) {
      return {
        ...base,
        ok: false,
        can_send_message: null,
        entities: [],
        errors: [],
        additional_info: [],
        fetch_error: j?.error?.message ?? `HTTP ${r.status}`,
      };
    }
    const hs = j?.health_status ?? null;
    const entities: HealthEntity[] = Array.isArray(hs?.entities) ? hs.entities : [];
    return {
      ...base,
      ok: true,
      can_send_message: hs?.can_send_message ?? null,
      entities,
      errors: entities.flatMap((e) =>
        (e.errors ?? []).map((x) => ({ entity: e.entity_type ?? null, ...x })),
      ),
      additional_info: entities.flatMap((e) =>
        (e.additional_info ?? []).map((m) => ({ entity: e.entity_type ?? null, message: m })),
      ),
      fetch_error: null,
    };
  } catch (e: any) {
    return {
      ...base,
      ok: false,
      can_send_message: null,
      entities: [],
      errors: [],
      additional_info: [],
      fetch_error: e?.message ?? "erro de rede",
    };
  }
}

type PersistArgs = {
  node_kind: "PHONE_NUMBER" | "WABA" | "MESSAGE_TEMPLATE";
  node_id: string;
  connection_id?: string | null;
  waba_ref_id?: string | null;
  template_ref_id?: string | null;
  workspace_id?: string | null;
  label?: string | null;
};

/** Grava snapshot, gera eventos de mudança e notifica o workspace. */
async function persistSnapshot(
  db: any,
  args: PersistArgs,
  snap: Omit<HealthSnapshot, "node_kind" | "label">,
): Promise<HealthSnapshot> {
  const { data: prev } = await db
    .from("wa_health_status")
    .select("can_send_message, entities")
    .eq("node_kind", args.node_kind)
    .eq("node_id", args.node_id)
    .maybeSingle();

  await db.from("wa_health_status").upsert(
    {
      node_kind: args.node_kind,
      node_id: args.node_id,
      connection_id: args.connection_id ?? null,
      waba_ref_id: args.waba_ref_id ?? null,
      template_ref_id: args.template_ref_id ?? null,
      workspace_id: args.workspace_id ?? null,
      label: args.label ?? null,
      can_send_message: snap.can_send_message,
      entities: snap.entities,
      errors: snap.errors,
      additional_info: snap.additional_info,
      ok: snap.ok,
      fetch_error: snap.fetch_error,
      checked_at: snap.checked_at,
    },
    { onConflict: "node_kind,node_id" },
  );

  // Diff por entidade (número, WABA, app, portfólio, template) + status agregado
  if (snap.ok) {
    const prevEntities: HealthEntity[] = Array.isArray(prev?.entities) ? prev!.entities : [];
    const prevBy = new Map<string, string | undefined>();
    for (const e of prevEntities) prevBy.set(`${e.entity_type}:${e.id}`, e.can_send_message);

    const events: any[] = [];
    if (prev && prev.can_send_message !== snap.can_send_message) {
      events.push({
        node_kind: args.node_kind,
        node_id: args.node_id,
        connection_id: args.connection_id ?? null,
        workspace_id: args.workspace_id ?? null,
        label: args.label ?? null,
        entity_type: "OVERALL",
        previous_status: prev.can_send_message,
        new_status: snap.can_send_message,
        errors: snap.errors,
        additional_info: snap.additional_info,
      });
    }
    for (const e of snap.entities) {
      const key = `${e.entity_type}:${e.id}`;
      const before = prevBy.get(key);
      if (prevEntities.length > 0 && before !== undefined && before !== e.can_send_message) {
        events.push({
          node_kind: args.node_kind,
          node_id: args.node_id,
          connection_id: args.connection_id ?? null,
          workspace_id: args.workspace_id ?? null,
          label: args.label ?? null,
          entity_type: e.entity_type ?? null,
          previous_status: before ?? null,
          new_status: e.can_send_message ?? null,
          errors: e.errors ?? [],
          additional_info: (e.additional_info ?? []).map((m) => ({ message: m })),
        });
      }
    }

    if (events.length > 0) {
      await db.from("wa_health_events").insert(events);
      const worst = events.reduce(
        (acc: any, ev: any) =>
          (STATUS_ORDER[ev.new_status ?? ""] ?? 0) > (STATUS_ORDER[acc?.new_status ?? ""] ?? -1) ? ev : acc,
        events[0],
      );
      if (args.workspace_id && worst?.new_status && worst.new_status !== "AVAILABLE") {
        await db.rpc("notify_workspace", {
          _ws: args.workspace_id,
          _kind: "wa_health",
          _title: `Saúde de envio: ${worst.entity_type} agora ${worst.new_status}`,
          _body: `${args.label ?? args.node_id}: ${worst.previous_status ?? "—"} → ${worst.new_status}.` +
            (snap.errors[0]?.error_description ? ` ${snap.errors[0].error_description}` : ""),
          _link: "/admin/whatsapp/saude",
          _severity: worst.new_status === "BLOCKED" ? "error" : "warning",
          _metadata: { node_kind: args.node_kind, node_id: args.node_id, errors: snap.errors },
        });
      }
    }
  }

  return { ...snap, node_kind: args.node_kind, label: args.label ?? null };
}

async function resolveToken(db: any, connectionId: string) {
  const { data: conn } = await db
    .from("whatsapp_connections")
    .select("id, name, display_phone, workspace_id, phone_number_id, waba_id, waba_ref_id, access_token, use_global_token, graph_api_version")
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn) throw new Error("Conexão não encontrada.");
  const token = conn.use_global_token
    ? process.env.WHATSAPP_ACCESS_TOKEN || ""
    : conn.access_token || process.env.WHATSAPP_ACCESS_TOKEN || "";
  return { conn, token };
}

/** Atualiza a saúde do número de uma conexão (nó = phone_number_id, fallback waba_id). */
export async function refreshConnectionHealth(db: any, connectionId: string): Promise<HealthSnapshot> {
  const { conn, token } = await resolveToken(db, connectionId);
  const nodeId = conn.phone_number_id || conn.waba_id;
  const node_kind = conn.phone_number_id ? "PHONE_NUMBER" : "WABA";
  const label = conn.display_phone || conn.name || nodeId;
  if (!nodeId) throw new Error("Conexão sem phone_number_id/waba_id.");
  if (!token) {
    return persistSnapshot(
      db,
      { node_kind: node_kind as any, node_id: nodeId, connection_id: conn.id, waba_ref_id: conn.waba_ref_id, workspace_id: conn.workspace_id, label },
      {
        ok: false, node_id: nodeId, can_send_message: null, entities: [], errors: [], additional_info: [],
        fetch_error: "Sem token disponível para esta conexão.", checked_at: new Date().toISOString(),
      },
    );
  }
  const snap = await fetchHealth(nodeId, token, conn.graph_api_version);
  return persistSnapshot(
    db,
    { node_kind: node_kind as any, node_id: nodeId, connection_id: conn.id, waba_ref_id: conn.waba_ref_id, workspace_id: conn.workspace_id, label },
    snap,
  );
}

/** Atualiza a saúde de um template (nó = meta_template_id). */
export async function refreshTemplateHealth(db: any, templateRefId: string): Promise<HealthSnapshot> {
  const { data: tpl } = await db
    .from("whatsapp_templates")
    .select("id, name, language, meta_template_id, connection_id, waba_ref_id, workspace_id")
    .eq("id", templateRefId)
    .maybeSingle();
  if (!tpl) throw new Error("Template não encontrado.");
  if (!tpl.meta_template_id) throw new Error("Template sem meta_template_id (sincronize os templates).");
  if (!tpl.connection_id) throw new Error("Template sem conexão vinculada.");

  const { conn, token } = await resolveToken(db, tpl.connection_id);
  const label = `${tpl.name} (${tpl.language})`;
  if (!token) {
    return persistSnapshot(
      db,
      { node_kind: "MESSAGE_TEMPLATE", node_id: tpl.meta_template_id, connection_id: tpl.connection_id, waba_ref_id: tpl.waba_ref_id, template_ref_id: tpl.id, workspace_id: tpl.workspace_id ?? conn.workspace_id, label },
      {
        ok: false, node_id: tpl.meta_template_id, can_send_message: null, entities: [], errors: [], additional_info: [],
        fetch_error: "Sem token disponível para esta conexão.", checked_at: new Date().toISOString(),
      },
    );
  }
  const snap = await fetchHealth(tpl.meta_template_id, token, conn.graph_api_version);
  return persistSnapshot(
    db,
    { node_kind: "MESSAGE_TEMPLATE", node_id: tpl.meta_template_id, connection_id: tpl.connection_id, waba_ref_id: tpl.waba_ref_id, template_ref_id: tpl.id, workspace_id: tpl.workspace_id ?? conn.workspace_id, label },
    snap,
  );
}

/** Lê do cache; se estiver velho (ou ausente) revalida na Graph API. */
export async function getHealthCached(
  db: any,
  opts: { node_kind: "PHONE_NUMBER" | "WABA" | "MESSAGE_TEMPLATE"; node_id?: string | null; connection_id?: string | null; template_ref_id?: string | null; maxAgeSec?: number },
): Promise<HealthSnapshot | null> {
  const maxAge = opts.maxAgeSec ?? 300;
  let q = db.from("wa_health_status").select("*").eq("node_kind", opts.node_kind);
  if (opts.node_id) q = q.eq("node_id", opts.node_id);
  else if (opts.template_ref_id) q = q.eq("template_ref_id", opts.template_ref_id);
  else if (opts.connection_id) q = q.eq("connection_id", opts.connection_id);
  const { data: row } = await q.maybeSingle();

  const fresh = row && Date.now() - new Date(row.checked_at).getTime() < maxAge * 1000;
  if (fresh) {
    return {
      ok: row.ok, node_kind: row.node_kind, node_id: row.node_id, can_send_message: row.can_send_message,
      entities: row.entities ?? [], errors: row.errors ?? [], additional_info: row.additional_info ?? [],
      fetch_error: row.fetch_error, checked_at: row.checked_at, label: row.label, cached: true,
    };
  }

  try {
    if (opts.node_kind === "MESSAGE_TEMPLATE" && opts.template_ref_id) {
      return await refreshTemplateHealth(db, opts.template_ref_id);
    }
    if (opts.connection_id) return await refreshConnectionHealth(db, opts.connection_id);
  } catch {
    /* mantém o cache velho abaixo */
  }
  if (!row) return null;
  return {
    ok: row.ok, node_kind: row.node_kind, node_id: row.node_id, can_send_message: row.can_send_message,
    entities: row.entities ?? [], errors: row.errors ?? [], additional_info: row.additional_info ?? [],
    fetch_error: row.fetch_error, checked_at: row.checked_at, label: row.label, cached: true,
  };
}

export type SendabilityCheck = {
  allowed: boolean;
  status: string | null;
  source: "template" | "number" | "none";
  reason: string | null;
  errors: HealthSnapshot["errors"];
  additional_info: HealthSnapshot["additional_info"];
  checked_at: string | null;
};

/**
 * Pré-checagem antes de disparar: bloqueia quando BLOCKED ou LIMITED.
 * Usa cache (TTL padrão 5 min) para não estourar a API.
 * Falhas de consulta NÃO bloqueiam o envio (fail-open) — só status explícito bloqueia.
 */
export async function ensureSendable(
  db: any,
  opts: { connection_id: string; template_ref_id?: string | null; maxAgeSec?: number; blockOnLimited?: boolean },
): Promise<SendabilityCheck> {
  const blockOnLimited = opts.blockOnLimited !== false;
  const snap = opts.template_ref_id
    ? await getHealthCached(db, { node_kind: "MESSAGE_TEMPLATE", template_ref_id: opts.template_ref_id, maxAgeSec: opts.maxAgeSec })
      ?? await getHealthCached(db, { node_kind: "PHONE_NUMBER", connection_id: opts.connection_id, maxAgeSec: opts.maxAgeSec })
    : await getHealthCached(db, { node_kind: "PHONE_NUMBER", connection_id: opts.connection_id, maxAgeSec: opts.maxAgeSec });

  if (!snap || !snap.ok || !snap.can_send_message) {
    return { allowed: true, status: snap?.can_send_message ?? null, source: "none", reason: null, errors: [], additional_info: [], checked_at: snap?.checked_at ?? null };
  }

  const source = snap.node_kind === "MESSAGE_TEMPLATE" ? "template" : "number";
  const status = snap.can_send_message;
  const blocked = status === "BLOCKED" || (blockOnLimited && status === "LIMITED");
  if (!blocked) {
    return { allowed: true, status, source, reason: null, errors: snap.errors, additional_info: snap.additional_info, checked_at: snap.checked_at };
  }

  const detail =
    snap.errors[0]?.error_description ||
    snap.additional_info[0]?.message ||
    "Meta reportou restrição de envio.";
  const entity = snap.errors[0]?.entity ?? snap.additional_info[0]?.entity ?? snap.node_kind;
  return {
    allowed: false,
    status,
    source,
    reason: `health_status=${status} (${entity}): ${detail}`,
    errors: snap.errors,
    additional_info: snap.additional_info,
    checked_at: snap.checked_at,
  };
}
