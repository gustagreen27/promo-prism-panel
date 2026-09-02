import { createFileRoute } from '@tanstack/react-router'

/**
 * Cron (a cada 1 min): avança as métricas das execuções externas em andamento
 * mesmo sem ninguém abrir o admin/painel.
 */
export const Route = createFileRoute('/api/public/hooks/external-progress')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get('apikey')
        if (!apikey || apikey !== process.env['SUPABASE_PUBLISHABLE_KEY']) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { externalProgressPatch } = await import('@/lib/external-progression')

        const { data: rows, error } = await supabaseAdmin
          .from('wa_campaigns')
          .select(
            'id,external_status,external_total_count,external_sent_count,external_delivered_count,external_failed_count,external_target_sent_count,external_target_delivered_count,external_target_failed_count,external_started_at,external_finished_at',
          )
          .eq('execution_type', 'external')
          .not('external_started_at', 'is', null)
          .not('external_finished_at', 'is', null)
          // Inclui execuções sem status gravado (null) — elas também devem
          // progredir automaticamente até o horário de finalização.
          .or('external_status.is.null,external_status.in.(scheduled_external,in_progress)')
          .limit(500)
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const now = new Date()
        let updated = 0
        for (const r of (rows ?? []) as any[]) {
          const patch = externalProgressPatch(r, now)
          if (!patch) continue
          const { error: upErr } = await supabaseAdmin.from('wa_campaigns').update(patch as never).eq('id', r.id)
          if (!upErr) updated++
        }

        return new Response(JSON.stringify({ ok: true, scanned: rows?.length ?? 0, updated }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
