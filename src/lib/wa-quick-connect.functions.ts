import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { _syncOneWabaInternal } from "@/lib/wa-meta-sync.functions";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/**
 * "Conexão rápida" — parseia um bloco livre colado pelo admin e cria/atualiza
 * a WABA e o número correspondente, tentando sincronizar com a Meta.
 *
 * Formato aceito (rótulos em pt-BR, tolerante a espaços/ordem):
 *   WABA: <nome interno>
 *   Identificação: <waba_id>            (primeiro ID numérico após WABA)
 *   Propriedade de: <business_name>
 *   Número: | Perfil do telefone
 *   Identificação: <phone_number_id>    (segundo ID numérico)
 *   <nome de exibição>
 *   +55 11 95502-2059                    (display_phone)
 */

const parseSchema = z.object({
  raw: z.string().trim().min(10).max(4000),
  workspace_id: z.string().uuid().nullable().optional(),
});

type ParsedBlock = {
  waba_nome: string | null;
  waba_id: string | null;
  business_name: string | null;
  business_id: string | null;
  phone_number_id: string | null;
  phone_display_name: string | null;
  display_phone: string | null;
};

/** Extrai a informação do bloco livre. */
export function parseWaQuickBlock(raw: string): ParsedBlock {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedBlock = {
    waba_nome: null, waba_id: null, business_name: null, business_id: null,
    phone_number_id: null, phone_display_name: null, display_phone: null,
  };

  // First long numeric run = waba_id; second = phone_number_id.
  const numericIds: string[] = [];
  for (const l of lines) {
    const m = l.match(/\b(\d{10,})\b/);
    if (m) numericIds.push(m[1]);
  }
  if (numericIds[0]) out.waba_id = numericIds[0];
  if (numericIds[1]) out.phone_number_id = numericIds[1];

  // Display phone (with +)
  const phoneLine = lines.find((l) => /^\+?\d[\d\s().-]{6,}$/.test(l) && /\+/.test(l));
  if (phoneLine) out.display_phone = phoneLine.replace(/\s+/g, " ").trim();

  // Labeled sections
  const labelValue = (labels: string[]): string | null => {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      for (const lb of labels) {
        if (l.startsWith(lb.toLowerCase())) {
          const inline = lines[i].slice(lb.length).replace(/^[:\-\s]+/, "").trim();
          if (inline) return inline;
          // fall to next non-numeric, non-label line
          for (let j = i + 1; j < lines.length; j++) {
            const nxt = lines[j];
            if (!nxt) continue;
            if (/^identifica|^propriedade|^n[uú]mero|^perfil|^waba/i.test(nxt)) continue;
            return nxt;
          }
        }
      }
    }
    return null;
  };

  out.waba_nome = labelValue(["WABA"]);
  out.business_name = labelValue(["Propriedade de"]);

  // Phone display name = first non-numeric, non-labeled line after "Número" / "Perfil"
  const phoneAnchorIdx = lines.findIndex((l) => /^n[uú]mero|^perfil do telefone/i.test(l));
  if (phoneAnchorIdx >= 0) {
    for (let j = phoneAnchorIdx + 1; j < lines.length; j++) {
      const nxt = lines[j];
      if (/^identifica/i.test(nxt)) continue;
      if (/^\+?\d[\d\s().-]{6,}$/.test(nxt)) continue;
      if (/^\d{6,}$/.test(nxt)) continue;
      out.phone_display_name = nxt;
      break;
    }
  }

  return out;
}

export const parseQuickConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ raw: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data }) => parseWaQuickBlock(data.raw));

export const quickConnectWa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const parsed = parseWaQuickBlock(data.raw);
    if (!parsed.waba_id) throw new Error("Não foi possível identificar o WABA ID no texto colado.");
    if (!parsed.phone_number_id && !parsed.display_phone) {
      throw new Error("Não foi possível identificar o número (phone_number_id ou telefone).");
    }

    const supabase = context.supabase;

    // 1) Upsert WABA by waba_id
    const { data: existingWaba } = await supabase
      .from("whatsapp_wabas")
      .select("id, nome_interno, business_id, workspace_id, access_token, client_id, project_id, waba_id")
      .eq("waba_id", parsed.waba_id)
      .maybeSingle();

    let wabaRow = existingWaba;
    if (!wabaRow) {
      const insertPayload: Record<string, any> = {
        waba_id: parsed.waba_id,
        nome_interno: parsed.waba_nome || parsed.business_name || `WABA ${parsed.waba_id.slice(-6)}`,
        business_id: null,
        workspace_id: data.workspace_id ?? null,
        status: "ativo",
        onboarded_via: "quick_connect",
        onboarded_at: new Date().toISOString(),
      };
      const { data: created, error: cErr } = await supabase
        .from("whatsapp_wabas").insert(insertPayload).select().single();
      if (cErr) throw cErr;
      wabaRow = created;
    } else {
      const patch: Record<string, any> = {};
      if (!wabaRow.nome_interno && parsed.waba_nome) patch.nome_interno = parsed.waba_nome;
      if (data.workspace_id && !wabaRow.workspace_id) patch.workspace_id = data.workspace_id;
      if (Object.keys(patch).length) {
        await supabase.from("whatsapp_wabas").update(patch).eq("id", wabaRow.id);
        Object.assign(wabaRow, patch);
      }
    }

    // 2) Try to sync from Meta (creates/updates whatsapp_connections rows).
    let syncStats: any = null;
    let syncError: string | null = null;
    try {
      syncStats = await _syncOneWabaInternal(supabase, wabaRow as any);
    } catch (e: unknown) {
      syncError = e instanceof Error ? e.message : "Falha ao sincronizar com a Meta";
    }

    // 3) Ensure a whatsapp_connections row exists for the pasted number
    //    (fallback quando o sync não achou / token indisponível).
    let connectionId: string | null = null;
    if (parsed.phone_number_id) {
      const { data: existingConn } = await supabase
        .from("whatsapp_connections")
        .select("id, workspace_id, name, nome_interno")
        .eq("phone_number_id", parsed.phone_number_id)
        .maybeSingle();

      if (existingConn) {
        connectionId = existingConn.id;
        const patch: Record<string, any> = { waba_ref_id: wabaRow.id };
        if (data.workspace_id && !existingConn.workspace_id) patch.workspace_id = data.workspace_id;
        if (parsed.phone_display_name && !existingConn.nome_interno) patch.nome_interno = parsed.phone_display_name;
        await supabase.from("whatsapp_connections").update(patch).eq("id", existingConn.id);
      } else {
        const label = parsed.phone_display_name || parsed.display_phone || `Número ${parsed.phone_number_id.slice(-6)}`;
        const { data: created, error: cErr } = await supabase.from("whatsapp_connections").insert({
          waba_ref_id: wabaRow.id,
          workspace_id: data.workspace_id ?? wabaRow.workspace_id ?? null,
          client_id: wabaRow.client_id ?? null,
          project_id: wabaRow.project_id ?? null,
          phone_number_id: parsed.phone_number_id,
          waba_id: parsed.waba_id,
          business_id: wabaRow.business_id ?? null,
          display_phone: parsed.display_phone ?? null,
          phone: (parsed.display_phone || "").replace(/\D/g, "") || null,
          name: label,
          nome_interno: label,
          display_name: parsed.phone_display_name ?? null,
          verified_name: parsed.phone_display_name ?? null,
          provider: "meta_cloud",
          graph_api_version: "v21.0",
          status: "aguardando_verificacao",
          meta_sync_status: syncError ? "pending" : "connected",
          last_seen_at: new Date().toISOString(),
        }).select("id").single();
        if (cErr) throw cErr;
        connectionId = created.id;
      }
    }

    // 4) Set default_connection_id when workspace is provided and empty.
    if (data.workspace_id && connectionId) {
      const { data: ws } = await supabase
        .from("workspaces").select("default_connection_id").eq("id", data.workspace_id).maybeSingle();
      if (ws && !ws.default_connection_id) {
        await supabase.from("workspaces")
          .update({ default_connection_id: connectionId }).eq("id", data.workspace_id);
      }
    }

    return {
      ok: true,
      parsed,
      waba_ref_id: wabaRow.id,
      connection_id: connectionId,
      sync: syncStats,
      sync_error: syncError,
    };
  });
