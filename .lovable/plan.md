# Personalização pública completa por disparo

## Novas tabelas (migration única)

```
campaign_public_settings          -- 1:1 com campaigns
  campaign_id (PK, FK campaigns)
  enabled boolean                 -- master switch
  metrics_mode text               -- 'real' | 'replace' | 'merge' (default 'real')
  custom_totals jsonb             -- { clicks, countries_count, cities_count, devices_count }
  clicks_series jsonb             -- [{ت, count }]
  hourly_series jsonb             -- [{ hour, count }]
  updated_at, updated_by

public_metrics_override           -- 1:N por chave (país/cidade/dispositivo/navegador)
  id, campaign_id, kind ('country'|'city'|'device'|'browser')
  label, count, position

campaign_public_dispatches        -- 1:1 com wa_campaigns (por disparo)
  wa_campaign_id (PK, FK wa_campaigns)
  campaign_id (FK, para RLS/listagem)
  enabled boolean
  mode text                       -- 'real' | 'fixed' | 'auto'
  public_name text, public_status text
  fixed jsonb                     -- { total, sent, delivered, failed, percent, started_at, eta_at, speed_label, updated_at }
  updated_at, updated_by

public_progress_simulation        -- 1:1 com wa_campaigns (modo auto)
  wa_campaign_id (PK)
  start_at, end_at, duration_sec, refresh_interval_sec
  sent_start, sent_end
  delivered_ratio, failed_ratio   -- ou explícitos delivered_start/end
  percent_start, percent_end
  growth text                     -- 'linear'|'random'|'batches'|'stepped'|'real_plus'|'manual'
  growth_params jsonb             -- { min_step, max_step, batch_size, batch_interval, offset }
  runtime jsonb                   -- { active, started_at, paused_at, accumulated_pause_ms, manual_value }
  pauses jsonb                    -- [{ after_sent, duration_sec, status_label, recalc_eta }]
  status_label text
```

Todas com RLS por workspace (via `campaigns.workspace_id`), GRANT authenticated + service_role, e SELECT anon na leitura pública via server function publishable.

## Server functions (src/lib/public-overrides.functions.ts — novo)

- `getCampaignPublicSettings(campaignId)` — settings + dispatches + simulations + metric items (admin)
- `updateCampaignPublicSettings(campaignId, patch)` — enable/disable master, metrics_mode, totals, séries
- `upsertPublicDispatch(waCampaignId, patch)` — nome/status/mode/fixed
- `upsertPublicSimulation(waCampaignId, patch)` — parâmetros de progressão automática
- `controlPublicSimulation(waCampaignId, action)` — start/pause/resume/restart/sync_real/disable
- `upsertMetricOverride(id?, campaignId, kind, label, count, position)`
- `deleteMetricOverride(id)`
- `reorderMetricOverrides(campaignId, kind, ids[])`
- `duplicatePublicDispatchConfig(fromWaId, toWaId)`
- `clearAllPublicOverrides(campaignId)`

`getPublicCampaignReport` (existente em campaigns.functions.ts) lê as novas tabelas via cliente publishable e aplica overrides. Retorna `server_now` para cálculo client-side da simulação.

## Cálculo da simulação (src/lib/public-simulation.ts — refatorar)

`computeDispatchSnapshot(simulation, realDispatch, serverNow)` retorna
`{ sent, delivered, failed, percent, status, eta_at, updated_at }`
aplicando growth kind, pausas programadas e ajuste `real_plus`. Idêntico ao atual, mas por-disparo.

## UI (/admin/campaigns/:id)

Substituir o botão único por página/aba **"Personalização pública"** com:

1. **Cabeçalho** — switch master, badge "Ativa", botões: Ver pública, Pré-visualizar, Restaurar reais, Limpar tudo.
2. **Métricas gerais** — toggle modo (real/substituir/mesclar); totais numéricos; editor de séries; tabelas CRUD (add/edit/delete/reordenar drag) para países, cidades, dispositivos, navegadores.
3. **Disparos vinculados** — lista de `wa_campaigns` da campanha; cada card expansível com:
   - Modo: Real | Fixo | Automático
   - **Fixo**: nome público, status público (select 10 opções + custom), total, enviados, entregues, falhas, %, início, ETA, velocidade, updated_at
   - **Automático**: todos os campos de tempo (início/fim/duração/intervalo), taxas por s/min/h, valores início/fim (enviados/entregues/falhas/%), curva de crescimento + params, pausas programadas (após N envios, duração, status, recalc ETA), controles run/pause/resume/restart/sync/disable, preview projeção +5m/+30m/+1h/+4h
   - Ação: duplicar config para outro disparo
4. **Rodapé** — Salvar, cancelar, última atualização.

Componentes novos:
- `src/components/admin/public-customization/index.tsx` (container + tabs)
- `.../general-metrics-tab.tsx`
- `.../metric-list-editor.tsx` (CRUD + reorder)
- `.../dispatch-card.tsx` (por wa_campaign)
- `.../dispatch-fixed-form.tsx`
- `.../dispatch-auto-form.tsx`
- `.../simulation-preview.tsx`

## Página pública (src/routes/campaigns.$id.tsx)

- Ler settings + dispatches + simulations + metric items via `getPublicCampaignReport`
- Para cada bloco de disparo: se `enabled && mode='fixed'` → usar `fixed`; se `mode='auto'` → hook `useDispatchSimulation` recalcula a cada `refresh_interval_sec`; senão dados reais
- Métricas gerais: aplicar `metrics_mode` (replace/merge) por chave
- Nunca ler/escrever em wa_campaigns/campaign_recipients

## Isolamento operacional

Nenhum código em wa-campaign-runner, wa-queue, webhooks, admin.disparos lê essas tabelas. Toda escrita passa por server fns novas com `requireSupabaseAuth` + checagem `has_role('admin')` ou membership do workspace.

## Arquivos afetados

Novos:
- `supabase/migrations/<timestamp>_public_customization.sql`
- `src/lib/public-overrides.functions.ts`
- `src/components/admin/public-customization/*` (7 arquivos)
- `src/hooks/use-dispatch-simulation.ts`

Editados:
- `src/lib/public-simulation.ts` — generalizar por-disparo
- `src/lib/campaigns.functions.ts` — `getPublicCampaignReport` lê novas tabelas
- `src/routes/campaigns.$id.tsx` — aplicar overrides por bloco
- `src/routes/_authenticated/admin.campaigns.$id.tsx` — abrir novo painel
- `src/routes/_authenticated/admin.campanhas.tsx` — badge "personalização ativa"

## Fora de escopo

Nenhuma alteração em: wa_campaigns, campaign_recipients, wa_campaign_runner, wa-queue, webhooks, edge functions, triggers de campanha, RLS existente, `/admin/disparos`.
