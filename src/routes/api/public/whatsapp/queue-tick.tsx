import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/queue-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processCampaignTick } = await import("@/lib/wa-queue.server");

        const nowIso = new Date().toISOString();

        // Preflight validation of scheduled campaigns whose time has come
        const { data: due } = await supabaseAdmin
          .from("wa_campaigns")
          .select("id,workspace_id,connection_id,template_id,total_recipients,list_id,name")
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso);

        for (const camp of due ?? []) {
          const errors: string[] = [];
          if (!camp.connection_id) errors.push("Sem número de WhatsApp");
          if (!camp.template_id) errors.push("Sem template");
          if (!camp.total_recipients) errors.push("Sem destinatários");

          if (camp.connection_id) {
            const { data: conn } = await supabaseAdmin.from("whatsapp_connections")
              .select("status,access_token,phone_number_id")
              .eq("id", camp.connection_id).maybeSingle();
            if (!conn) errors.push("Número não encontrado");
            else if (conn.status && String(conn.status).toLowerCase() !== "active" && String(conn.status).toLowerCase() !== "connected") errors.push(`Número inativo (${conn.status})`);
            else if (!conn.access_token || !conn.phone_number_id) errors.push("Token/phone_number_id ausente");
          }
          if (camp.template_id) {
            const { data: tpl } = await supabaseAdmin.from("whatsapp_templates")
              .select("status,name").eq("id", camp.template_id).maybeSingle();
            if (!tpl) errors.push("Template não encontrado");
            else if (tpl.status && String(tpl.status).toUpperCase() !== "APPROVED") errors.push(`Template não aprovado (${tpl.status})`);
          }

          if (errors.length > 0) {
            const msg = errors.join(" · ");
            await supabaseAdmin.from("wa_campaigns")
              .update({ status: "error", last_error: msg, finished_at: nowIso })
              .eq("id", camp.id);
            try {
              await supabaseAdmin.from("campaign_timeline").insert({
                campaign_id: camp.id, event_type: "preflight_failed", message: msg, payload: { errors },
              });
            } catch { /* ignore */ }
            if (camp.workspace_id) {
              try {
                await supabaseAdmin.rpc("notify_workspace" as any, {
                  _ws: camp.workspace_id, _kind: "campaign.failed",
                  _title: "Falha ao iniciar campanha",
                  _body: `"${camp.name}": ${msg}`,
                  _link: "/painel/agenda", _severity: "error",
                  _metadata: { campaign_id: camp.id, errors },
                });
              } catch { /* ignore */ }
            }
          } else {
            await supabaseAdmin.from("wa_campaigns")
              .update({ status: "running", started_at: nowIso })
              .eq("id", camp.id);
            if (camp.workspace_id) {
              try {
                await supabaseAdmin.rpc("notify_workspace" as any, {
                  _ws: camp.workspace_id, _kind: "campaign.started",
                  _title: "Campanha iniciada",
                  _body: `"${camp.name}" começou.`,
                  _link: "/painel/agenda", _severity: "info",
                  _metadata: { campaign_id: camp.id },
                });
              } catch { /* ignore */ }
            }
          }
        }

        // Auto-retomar campanhas pausadas por erro de rede após 1 min
        await supabaseAdmin
          .from("wa_campaigns")
          .update({ status: "running", pause_reason: null, paused_at: null, scheduled_at: null })
          .eq("status", "paused")
          .eq("pause_reason", "network_error")
          .lte("scheduled_at", nowIso);

        const { data: running } = await supabaseAdmin
          .from("wa_campaigns")
          .select("id, send_rate_per_min")
          .eq("status", "running");

        const results: any[] = [];
        for (const c of running ?? []) {
          const batch = Math.min(Math.max(Number(c.send_rate_per_min) || 30, 1), 200);
          try {
            const r = await processCampaignTick(c.id, batch);
            results.push({ id: c.id, ...r });
          } catch (e: any) {
            results.push({ id: c.id, error: e?.message });
          }
        }
        return Response.json({ ok: true, processed_at: nowIso, results });
      },
    },
  },
});
