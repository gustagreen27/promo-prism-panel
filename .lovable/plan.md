# Disparos assíncronos estilo Infobip/Data Crazy

Transformar o módulo de campanhas em um sistema com fila real, worker em background, progresso em tempo real e relatório final premium — reaproveitando `wa_campaigns`, `campaign_recipients`, `message_logs`, `whatsapp_wabas`, `whatsapp_connections`, `whatsapp_templates`, `message_stock` e `opt_outs`.

## 1. Schema (migração única)

**`wa_campaigns`** — novos campos:
- `status` expandido: `rascunho | agendada | na_fila | em_andamento | pausada | concluida | cancelada | erro | parcial`
- `started_at`, `paused_at`, `resumed_at`, `finished_at`, `canceled_at timestamptz`
- `started_by uuid`, `paused_by`, `canceled_by uuid` → `auth.users`
- `progress jsonb` (contadores materializados: total/pending/processing/accepted/sent/delivered/read/failed/responded/optout/skipped/canceled)
- `last_error text`, `last_sent_at timestamptz`, `avg_speed_per_min numeric`
- `final_report jsonb` (snapshot gerado no fim)
- `worker_lease_until timestamptz`, `worker_lease_id uuid` (lock de worker)

**`campaign_recipients`** — status individual expandido:
`pendente | processando | accepted | sent | delivered | read | failed | responded | optout | skipped | canceled`
- `meta_message_id text`, `attempts int default 0`, `last_attempt_at`, `sent_at`, `delivered_at`, `read_at`, `responded_at`, `failed_at`, `error_code text`, `error_message text`, `variables_snapshot jsonb`

**`campaign_timeline`** (nova) — linha do tempo:
- `campaign_id`, `event_type` (`created|started|queued|paused|resumed|canceled|completed|report_generated|milestone|error|message_sent|message_delivered|message_read|message_failed|response_received|optout_detected`), `actor_id`, `payload jsonb`, `created_at`
- Índice em `(campaign_id, created_at desc)`
- RLS admin-only

**Triggers**:
- Trigger em `campaign_recipients` que recalcula `wa_campaigns.progress` a cada UPDATE de status
- Trigger que insere em `campaign_timeline` em mudanças de status da campanha

## 2. Worker (cron + endpoint)

Endpoint público autenticado por `apikey` (Supabase anon key):
`POST /api/public/wa/worker/tick`

Chamado a cada 1 min por `pg_cron` via `pg_net`. Também acionado imediatamente quando o usuário clica Iniciar/Retomar (via server fn que faz fetch interno).

Lógica do tick:
1. Buscar campanhas `em_andamento` OU `agendada` com `scheduled_at <= now()` ou `na_fila`.
2. Para cada campanha, tentar adquirir lease: `UPDATE ... SET worker_lease_until = now()+3min, worker_lease_id = gen_random_uuid() WHERE worker_lease_until IS NULL OR worker_lease_until < now()` (evita duplo processamento).
3. Dentro do lease, processar em lote (ex: 50 recipients por tick, respeitando rate limit Meta):
   - `SELECT ... FROM campaign_recipients WHERE campaign_id = ? AND status = 'pendente' LIMIT 50 FOR UPDATE SKIP LOCKED`
   - Marca `processando`, renderiza variáveis, valida opt-out, valida estoque, envia via Cloud API.
   - Salva `meta_message_id`, status `accepted/sent` ou `failed` com `error_code/message`.
   - `wa_consume_stock` a cada envio bem-sucedido.
   - Insere linha na `campaign_timeline` para marcos (a cada 10% ou eventos).
4. Se campanha `pausada|cancelada` — libera lease sem processar. Cancelamento marca pendentes como `canceled`.
5. Se `pending = 0` — status vai para `concluida` (ou `parcial` se houve falhas), gera `final_report jsonb`, insere evento `completed` + `report_generated`.
6. Retry: `failed` com erros temporários (Meta code 130429/131056/etc) permanece `pendente` até `attempts >= 3`.

**Webhook oficial** `/api/public/whatsapp/webhook` já existe — apenas estender para: localizar recipient por `meta_message_id` e atualizar `delivered_at/read_at/responded_at/failed_at` + inserir timeline event. Não alterar validação/verify_token.

## 3. Server functions (`src/lib/wa-campaign-runner.functions.ts`)

- `preflightCampaign({campaignId})` → checklist (cliente/projeto/lista/número/template/opt-in/estoque/token/webhook). Retorna `{ok, checks[]}`.
- `startCampaign({campaignId})` — valida preflight, cria recipients da lista (dedup por telefone), status → `em_andamento`, dispara tick.
- `pauseCampaign`, `resumeCampaign`, `cancelCampaign` — atualizam status + timeline.
- `retryFailed({campaignId})` — reseta `failed` transitórios para `pendente`.
- `getCampaignProgress({campaignId})` — retorna `progress`, `last_error`, `last_sent_at`, `avg_speed_per_min`, ETA calculado.
- `getCampaignTimeline({campaignId, limit})`.
- `getCampaignFinalReport({campaignId})` — se `final_report` existe retorna, senão recalcula on-the-fly.
- `exportRecipientsCSV({campaignId})`.

Todas com `requireSupabaseAuth` + `has_role('admin')`.

## 4. Frontend

**`/admin/campanhas/nova`** (wizard existente): passo final adiciona botão **Iniciar agora** vs **Salvar rascunho** vs **Agendar**. Ao iniciar, roda `preflightCampaign` — se falha, mostra `PreflightChecklist` (X vermelho / ✓ verde por item, com botão fix).

**`/admin/campanhas/$id`** (nova tela detalhe premium) com abas:

1. **Visão geral** — StatusBadge, cards (Total, Processadas, Entregues, Lidas, Falhas, Respostas, Opt-outs), barra de progresso premium, velocidade média, ETA, última mensagem, último erro. Botões: Pausar/Retomar/Cancelar/Reprocessar falhas/Duplicar/Exportar. Polling via `useQuery` refetchInterval 3s enquanto `em_andamento|na_fila`.
2. **Destinatários** — DataTable com telefone/nome/status/sent/delivered/read/erro + filtros por status + export CSV.
3. **Timeline** — feed vertical estilo activity (ícones por evento, timestamps relativos).
4. **Respostas** — mensagens inbound vinculadas via `meta_message_id → context.id`.
5. **Erros** — agrupado por `error_code`, com contagem e primeiros exemplos.
6. **Financeiro** — estoque consumido, custo estimado, valor cobrado (do cliente/projeto), lucro, custo/msg entregue, custo/resposta.
7. **Relatório final** — só habilita quando `concluida|parcial|cancelada`. Render do `final_report` no padrão dos relatórios existentes. Botões Exportar CSV/Excel, Imprimir (window.print com CSS print-only), Duplicar campanha.

**`/admin/campanhas`** (lista existente): coluna de progresso inline (mini barra), StatusBadge unificado, link para detalhe.

## 5. Componentes reutilizáveis

- `<ProgressBarPremium value total />`
- `<CampaignStatusBadge status />` (mapeia 9 status → cores semânticas)
- `<PreflightChecklist checks />`
- `<TimelineFeed events />`
- `<StatCardGroup />` já existe do redesign
- `<RecipientStatusBadge />`

## 6. Cron

```sql
select cron.schedule('wa-campaign-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://project--<id>.lovable.app/api/public/wa/worker/tick',
    headers := '{"apikey":"<anon>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

## 7. Segurança / regras (preservadas)

- Tokens WhatsApp só no backend (worker lê `whatsapp_connections.access_token_encrypted` ou secret).
- Opt-out validado no worker antes de cada envio.
- Estoque validado antes do envio; falha se insuficiente marca `skipped`.
- Dedup de telefone por campanha (unique `(campaign_id, phone)`).
- Lease impede execução concorrente.
- Nada muda no webhook oficial além de handlers de status por `meta_message_id`.
- RLS admin-only em todas as tabelas novas.

## 8. Escopo NÃO incluído

- Não altera wizard de criação além do botão final.
- Não altera `/api/public/whatsapp/webhook` GET (verify) — apenas estende POST.
- Não mexe em Embedded Signup, WABAs, Templates, Números.
- Não remove nada existente.

## Ordem de implementação

1. Migração (schema + triggers + cron).
2. Server functions + endpoint worker.
3. Extensão do webhook para status por `meta_message_id`.
4. Tela detalhe `/admin/campanhas/$id` com 7 abas.
5. Preflight + botão Iniciar no wizard.
6. Ajuste da lista com progresso inline.
