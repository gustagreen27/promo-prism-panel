# Campanhas Multi-Rota — Fase 1

## Decisões
- Fluxo legado preservado (campanhas existentes NÃO migradas). Flag `wa_campaigns.use_multi_route` (default false).
- SWRR proporcional a `rate_per_second` efetivo por número.
- Failover automático DESLIGADO por default; erros 132015/132016/132001 pausam SÓ a rota e notificam.
- Dedup lógico via `uniq_recipient_campaign_phone` (já existe) + `wa_campaign_attempts` para histórico imutável.

## Schema novo
- `wa_campaign_routes` (id, campaign_id, connection_id, phone_number_id, waba_ref_id, template_id, template_name, template_language, priority, weight, status, rate_effective, max_concurrency, accepted_count, failed_count, last_error_code, last_error_at, disabled_reason, variables_mapping, is_primary, timestamps)
- `wa_campaign_attempts` (id, campaign_id, recipient_id, route_id, phone_number_id, template_id, template_name, attempt_number, attempted_at, http_status, meta_message_id, message_status, error_code, error_details, worker_id)
- `campaign_recipients` +cols: `route_id` (rota escolhida no despacho), `locked_route_id` (afinidade)
- `wa_campaigns` +cols: `use_multi_route`, `distribution_strategy` (weighted|round_robin|primary_reserve|custom), `template_failover_mode` (manual|auto)
- Status novos em `wa_route_status` enum: active, paused, template_unavailable, number_unavailable, rate_limited, disabled, completed

## Worker
- `queue-tick`: se `use_multi_route`, chama `runMultiRouteCampaign`.
- Selector SWRR entre rotas active com bucket disponível.
- Recipient com `locked_route_id` respeitado em retries.
- Erros 132015/132016/132001 marcam rota, liberam `processing` (route_id=NULL) para pendentes.

## Wizard
- Passo 02 reescrito: NumbersMultiSelect + TemplatesPerNumber + StrategyPicker + FailoverToggles + Summary
- Nova serverFn `createMultiRouteWaCampaign` que cria campaign + N rotas.

## Detalhe da campanha
- Aba "Rotas" com pause/resume/replace-template/adicionar-remover-rota.
- Botão "Trocar template" abre modal com mapeamento de variáveis.
