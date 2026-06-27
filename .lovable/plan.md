
Vou implementar em 4 ondas independentes, cada uma testável e mesclável separadamente. Após cada onda eu valido o build antes de partir para a próxima.

## Onda 1 — Modos de abertura (Smart por padrão)

Adicionar ao banco e UI a escolha de comportamento da página `/$slug`.

- Migration: `ALTER TABLE campaigns ADD COLUMN open_mode text NOT NULL DEFAULT 'smart'` (`smart` | `iframe` | `redirect` | `wrapper`) + `iframe_compatible boolean`, `iframe_checked_at timestamptz` (cache do health check).
- `src/lib/campaign-options.ts`: exportar `OPEN_MODES` com label/descrição.
- Editor (`campaigns.$id.edit.tsx`) e diálogo de criação (`_authenticated/index.tsx`): novo `<Select>` para `open_mode`.
- `src/routes/$slug.tsx` (SSR loader):
  - `smart`: usa `iframe_compatible` em cache; se ainda não checado, faz HEAD inline; se incompatível → redirect 302; senão renderiza iframe.
  - `iframe`: sempre iframe (com watchdog cliente caindo para redirect se `load` não disparar).
  - `redirect`: 302 imediato no servidor + `meta refresh` fallback.
  - `wrapper`: renderiza página intermediária (usando `intermediate_text`/`cta_label`/preview image).
- Health Check ao salvar: server fn `recheckIframeCompatibility(id)` chamada automaticamente quando `destination_url` muda; resultado popula `iframe_compatible`. Botão "Re-checar" no editor.

## Onda 2 — Eventos detalhados de tracking

Granularidade de eventos além do `campaign_clicks` atual.

- Migration nova tabela `campaign_events`:
  - colunas: `id`, `campaign_id`, `click_id` (FK opcional para `campaign_clicks`), `event_type` enum, `metadata jsonb`, `created_at`.
  - enum `campaign_event_type`: `page_view`, `iframe_loaded`, `iframe_blocked`, `redirect_started`, `redirect_completed`, `cta_clicked`, `utm_detected`, `duplicate_click`, `returning_visitor`, `bot_detected`.
  - GRANT `INSERT` para `anon`+`authenticated` (com policy `WITH CHECK (true)` — escrita pública mas só leitura admin).
  - GRANT `SELECT` apenas para admin via `has_role`.
- `src/lib/track.functions.ts`:
  - `trackClick` retorna `click_id`; já registra `page_view` + `returning_visitor` (cookie `lv_visitor`) + `duplicate_click` (mesmo IP+UA em <30s) + `bot_detected` (regex em UA).
  - Novas server fns `logEvent({campaign_id, click_id, event_type, metadata})` chamada do cliente para `iframe_loaded`, `iframe_blocked`, `redirect_started/completed`, `cta_clicked`.
- `$slug.tsx`: dispara eventos do iframe (`onLoad`, watchdog timeout) e do CTA do wrapper. Tudo fire-and-forget.

## Onda 3 — Dashboard de métricas

Novo route `src/routes/_authenticated/analytics.tsx` (acessível do menu).

- Server fns agregadoras (todas com `requireSupabaseAuth` + check `has_role('admin')`):
  - `getOverview(range)`: total acessos, únicos (por IP+UA), iframe bloqueado %, redirect %.
  - `getTimeSeries(range, granularity)`: por hora e por dia.
  - `getTopBreakdowns(range)`: dispositivo, cidade, browser, referer, UTM source.
  - `getEventLog(filters, pagination)`: tabela cursor-paginada.
- UI: cards de KPI + 2 gráficos (linha/barra do recharts) + 4 listas top-N + tabela de eventos com filtros (campanha, data, intenção, status, origem) e export CSV.
- Filtros sincronizados com `searchSchema` da rota (URL shareable).

## Onda 4 — RBAC completo + versionamento + auditoria + LGPD básico

### RBAC 4 perfis
- Migration: estender enum `app_role` para `super_admin`, `admin`, `editor`, `viewer`.
- Atualizar policies de `campaigns`:
  - INSERT/UPDATE: `super_admin`, `admin`, `editor` (editor só em rascunhos).
  - publicar (set `status='active'`): `super_admin`, `admin`.
  - DELETE/archive: `super_admin`, `admin`.
  - SELECT no admin: todos os 4 perfis.
- UI: tela `users.tsx` (apenas super_admin) para conceder/remover roles via Supabase Admin API (server fn protegida).

### Versionamento
- Migration: `campaign_versions` (id, campaign_id, version_no, snapshot jsonb, changed_by, changed_at, change_summary jsonb).
- Trigger `BEFORE UPDATE ON campaigns`: salva snapshot da versão anterior e gera diff.
- `updateCampaign` recebe trigger automaticamente; nada muda na chamada.
- Aba "Histórico" no editor: lista versões + botão "Restaurar" (cria nova versão a partir da escolhida).

### Audit log
- Migration: `audit_log` (id, actor_id, action enum, target_type, target_id, metadata jsonb, created_at). Admin-only read.
- Helper `logAudit(action, target, metadata)` chamado dentro de cada server fn relevante (createCampaign, updateCampaign, publishCampaign, pauseCampaign, archiveCampaign, deleteCampaign, runIntent, applyPreset, uploadImage).
- Tela `audit.tsx` (admin+) com filtros.

### LGPD
- Migration: coluna `ip_anonymized text` em `campaign_clicks`; trigger `BEFORE INSERT` que mascara o último octeto (`192.168.1.0`).
- Server fn `purgeOldClicks()` (deleta >180 dias) + endpoint cron `/api/public/cron/purge` com `CRON_SECRET`.
- Página `/privacy` pública com política gerada a partir dos campos coletados.

## Detalhes técnicos transversais

- Todas as server fns mutativas: `requireSupabaseAuth` + verificação de role via `has_role`.
- Eventos do cliente: enviados via `navigator.sendBeacon` quando possível (não bloqueia navegação no caso de `redirect_started`).
- Re-check iframe automático após `updateCampaign` quando `destination_url` mudar (já com debounce no editor).
- Mantenho o redirect imediato existente (sem tela intermediária) como comportamento para `open_mode='redirect'` e fallback do `smart`.

## Ordem de execução

1. Onda 1 inteira (migration + UI + loader) — valido `bun run build`.
2. Onda 2 (migration + tracking) — testo `/$slug` numa campanha real, verifico inserts em `campaign_events`.
3. Onda 3 (dashboard) — adiciono link no menu admin.
4. Onda 4 dividida em 4a (RBAC), 4b (versionamento), 4c (auditoria), 4d (LGPD) — cada uma com sua migration.

Posso entregar tudo em sequência sem novas perguntas, ou parar para sua validação ao fim de cada onda. **Por padrão, vou rodar onda por onda e te avisar a cada conclusão** para você testar antes da próxima.
