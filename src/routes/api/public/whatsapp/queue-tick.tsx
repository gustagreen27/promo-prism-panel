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
            else if (conn.status && !["ativo", "active", "connected"].includes(String(conn.status).toLowerCase())) errors.push(`Número inativo (${conn.status})`);
            else if (!conn.phone_number_id) errors.push("phone_number_id ausente");
            else if (!conn.access_token && !process.env.WHATSAPP_ACCESS_TOKEN) errors.push("Token de acesso ausente (sem token global)");
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

        // Auto-heal: libera leases expirados de campanhas em execução
        const leaseCutoff = new Date(Date.now() - 60 * 1000).toISOString();
        await supabaseAdmin
          .from("wa_campaigns")
          .update({ worker_lease_id: null, worker_lease_until: null })
          .in("status", ["running", "paused"])
          .not("worker_lease_until", "is", null)
          .lt("worker_lease_until", leaseCutoff);

        // Auto-heal: reenfileira destinatários "processing" órfãos.
        // Regras (todas devem ser verdadeiras):
        //  - status = 'processing'
        //  - meta_message_id IS NULL  (jamais mexe em quem já recebeu wamid)
        //  - last_attempt_at < now() - 5min  (janela > 5× MAX_TICK_RUNTIME_MS = 55s + 20s HTTP timeout)
        //  - a campanha do recipient NÃO possui lease ativo (evita colidir com um tick em execução).
        // A UPDATE é atômica (WHERE reavalia status na hora do write).
        const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const nowIso2 = new Date().toISOString();
        const { data: activeLeased } = await supabaseAdmin
          .from("wa_campaigns")
          .select("id")
          .in("status", ["running", "paused"])
          .not("worker_lease_until", "is", null)
          .gt("worker_lease_until", nowIso2);
        const activeLeaseIds = (activeLeased ?? []).map((c: any) => c.id as string);

        let healQuery = supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "pending", failed_reason: null, error_code: null })
          .eq("status", "processing")
          .is("meta_message_id", null)
          .lt("last_attempt_at", staleCutoff);
        if (activeLeaseIds.length > 0) {
          healQuery = healQuery.not("campaign_id", "in", `(${activeLeaseIds.join(",")})`);
        }
        const { data: healedRows } = await healQuery.select("campaign_id");
        if (healedRows && healedRows.length > 0) {
          const perCamp = new Map<string, number>();
          for (const r of healedRows) perCamp.set(r.campaign_id as string, (perCamp.get(r.campaign_id as string) ?? 0) + 1);
          for (const [cid, n] of perCamp) {
            try {
              await supabaseAdmin.from("campaign_timeline").insert({
                campaign_id: cid,
                event_type: "auto_unstuck",
                message: `${n} destinatário(s) reenfileirados automaticamente (lease campanha expirado, >5min sem wamid)`,
                payload: { count: n, stale_cutoff: staleCutoff },
              });
              await supabaseAdmin.rpc("wa_recalc_campaign_progress" as any, { _campaign_id: cid });
            } catch { /* ignore */ }
          }
        }



        // Auto-retomar campanhas "running" com pendentes cuja última tentativa é antiga
        // (nada a fazer aqui — o próprio processCampaignTick pega todas 'running')

        const { data: running } = await supabaseAdmin
          .from("wa_campaigns")
          .select("id, rate_per_second")
          .eq("status", "running");

        // MAX_TICK_RUNTIME_MS no worker = 55s (deixa 5s de folga para o cron
        // de 60s). Reservamos até rps * 55s (SEM inflação): 6 mps → 330 rows
        // como teto; a reserva real é progressiva dentro do tick, em blocos
        // de max_concurrency*2. O lease persistente garante 1 tick/campanha.
        const TICK_WINDOW_S = 55;
        const results: any[] = [];
        for (const c of running ?? []) {
          const rps = Math.max(1, Number((c as any).rate_per_second) || 6);
          // Suporta até 80 msg/s × 55s = 4400 reservas por tick.
          const reservationBudget = Math.min(5000, rps * TICK_WINDOW_S);
          try {
            const r = await processCampaignTick(c.id, reservationBudget);
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
