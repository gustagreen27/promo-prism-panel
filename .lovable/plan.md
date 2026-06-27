
# Disparos FR — Módulo WhatsApp Cloud API (MVP)

Vou evoluir o painel atual sem duplicar nada. As tabelas existentes `whatsapp_connections`, `whatsapp_messages`, `message_stock`, `clients`, `projects`, `campaigns` permanecem; estendo o que falta e crio só o que não existe.

## Escopo do MVP (este ciclo)

1. Cadastro completo de **Número WhatsApp** (Cloud API oficial)
2. **Templates** aprovados (cadastro manual + sync da Meta)
3. **Contatos**, **Listas**, **Tags**, importação CSV com opt-in
4. **Campanhas WhatsApp** em wizard (4 etapas)
5. **Fila de envio** com worker simulado e status por destinatário
6. **Service de envio** via `graph.facebook.com`
7. **Webhook** `/api/public/whatsapp/webhook` (GET verify + POST eventos + opt-out automático)
8. **Relatório da campanha** (enviadas, entregues, lidas, falhas, custo, lucro)
9. **Abatimento de estoque** por cliente/projeto
10. **Inbox** simples (lista de conversas + histórico)
11. Permissões: somente `admin` acessa tokens, webhooks, financeiro

Itens "para evoluir depois" (múltiplas WABAs por cliente, BullMQ/Redis, white-label, automações, agendamento avançado, Dashboard TV em tempo real) ficam com a estrutura de dados preparada mas sem UI nesta entrega.

## Banco de dados (migração única)

Reaproveito o que existe, estendo o resto. Toda tabela nova em `public` recebe GRANT + RLS + policies via `has_role(auth.uid(),'admin')`.

**Estender existentes**
- `whatsapp_connections` → adicionar: `phone_number_id`, `waba_id`, `business_id`, `access_token` (já tem `api_key` — renomeio uso), `verify_token`, `webhook_url`, `quality_rating`, `daily_limit`, `client_id`, `project_id`, `display_phone`
- `message_stock` → adicionar: `client_id`, `project_id`, `quantity_used`, `unit_cost`, `unit_price`, `status` (`ativo`/`esgotado`/`expirado`), `purchased_at`, `expires_at`
- `campaigns` → adicionar (sem quebrar campanhas de link existentes): `campaign_kind` enum (`link` | `whatsapp`, default `link`), `whatsapp_number_id`, `template_id`, `template_variables` jsonb, `scheduled_at`, `started_at`, `finished_at`, `send_rate_per_min`, `total_recipients`, `sent_count`, `delivered_count`, `read_count`, `failed_count`, `replied_count`, `estimated_cost`, `linked_revenue_id`

**Novas tabelas**
- `whatsapp_templates` (name, language, category, status, body, variables jsonb, header_type, buttons jsonb, connection_id, meta_template_id)
- `contacts` (name, phone E.164, email, client_id, project_id, source, opt_in, opt_in_at, opt_out, opt_out_at, last_interaction_at)
- `contact_tags` (name, color, client_id)
- `contact_tag_assignments` (contact_id, tag_id)
- `contact_lists` (name, client_id, project_id, description)
- `contact_list_items` (list_id, contact_id)
- `campaign_recipients` (campaign_id, contact_id, phone, variables jsonb, status enum, meta_message_id, sent_at, delivered_at, read_at, failed_at, failed_reason, error_code)
- `whatsapp_inbox` (connection_id, contact_id, phone, direction, body, meta_message_id, status, received_at)
- `whatsapp_webhook_logs` (connection_id, event_type, payload jsonb, processed, error)
- `opt_outs` (phone unique, reason, opted_out_at, client_id)
- `import_jobs` (filename, total, valid, invalid, duplicated, status, report jsonb)

Status enums: `recipient_status` (`pending`,`processing`,`sent`,`delivered`,`read`,`replied`,`failed`,`cancelled`,`opt_out`). Campanha: já existente + `paused`, `error`.

## Server functions (`src/lib/*.functions.ts`)

Todas com `requireSupabaseAuth` + check `has_role('admin')` (padrão já usado no projeto).

- `whatsapp-numbers.functions.ts` — list/create/update/delete números (extendendo `whatsapp_connections`)
- `whatsapp-templates.functions.ts` — list/create/update/delete + `syncTemplatesFromMeta(connectionId)` (chama `GET /{WABA_ID}/message_templates`)
- `contacts.functions.ts` — CRUD + `importContactsCsv` (validação telefone BR via regex E.164, dedupe, opt-in marcado, gera `import_jobs`)
- `contact-lists.functions.ts` — CRUD lista + add/remove contatos + filtro por tag
- `wa-campaigns.functions.ts` — CRUD wizard, `buildRecipients(campaignId)` (aplica lista+tags, exclui opt-out e duplicados, atualiza `total_recipients`), `startCampaign`, `pauseCampaign`, `cancelCampaign`, `campaignReport`
- `wa-stock.functions.ts` — estende `stock.functions.ts`: `getAvailableForProject(clientId, projectId)`, `consumeStock(projectId, qty)` (atômico, retorna erro se insuficiente)
- `inbox.functions.ts` — list conversations, list messages, send reply (usa mesmo service)
- `wa-send.server.ts` (server-only helper) — `sendTemplateMessage({phoneNumberId, accessToken, to, templateName, languageCode, variables})` com mapping para `components` da Meta, tratamento de erros tipados
- `wa-queue.server.ts` (server-only) — `processCampaignQueue(campaignId)` que pega N recipients `pending`, marca `processing`, chama send, atualiza status, respeita `send_rate_per_min`

## Server routes (HTTP públicos)

- `src/routes/api/public/whatsapp/webhook.tsx` — GET verifica `hub.verify_token` contra `whatsapp_connections.verify_token`; POST registra em `whatsapp_webhook_logs`, atualiza `campaign_recipients` por `meta_message_id`, insere em `whatsapp_inbox` se for mensagem recebida, marca opt-out se body contém palavras-chave (`parar|sair|cancelar|remover|não quero`).
- `src/routes/api/public/whatsapp/queue-tick.tsx` — POST protegido por `apikey` header (anon key), chama `processCampaignQueue` para todas campanhas em `running`. Agendado via `pg_cron` + `pg_net` a cada minuto.

## UI — submenus dentro de "WhatsApp"

Reorganizo `/admin/whatsapp` como rota-pai com tabs/subrotas:

- `/admin/whatsapp` → redireciona para Números
- `/admin/whatsapp/numeros` — lista + formulário rico (tokens, WABA, limites, qualidade, vínculos)
- `/admin/whatsapp/templates` — lista + criar manual + botão "Sincronizar com Meta"
- `/admin/whatsapp/webhooks` — mostra URL pública por número, verify_token, últimos eventos
- `/admin/whatsapp/qualidade` — read-only: quality_rating + limite + mensagens últimas 24h
- `/admin/whatsapp/inbox` — split view conversas/histórico
- `/admin/whatsapp/logs` — `whatsapp_webhook_logs` + `whatsapp_messages` paginados

**Cadastros** ganha:
- `/admin/contatos` — tabela + importação CSV
- `/admin/contatos/listas` — listas + tags + segmentos

**Campanhas** ganha modo WhatsApp:
- `/admin/campanhas` — passa a listar dos dois tipos (`link` e `whatsapp`) com filtro
- `/admin/campanhas/wa/new` — wizard 4 etapas (dados → público → whatsapp → revisão/envio)
- `/admin/campanhas/wa/$id` — progresso em tempo real (polling 5s) + relatório final

**Estoque de Msgs**: passa a mostrar pacotes por cliente/projeto com saldo, consumo e status.

## Integração com Financeiro

- Ao criar pacote em Estoque, checkbox "Lançar faturamento" cria linha em `revenues` vinculada.
- Ao concluir campanha, cria linha em `costs` com `estimated_cost = sent_count * unit_cost` do pacote consumido.
- Dashboard ganha cards: Mensagens enviadas mês, taxa entrega, campanhas em andamento, estoque vendido/usado.

## Segurança & Conformidade

- Toda função WhatsApp exige `admin` (já é o padrão do projeto).
- Webhook valida `verify_token` por número.
- Envio bloqueado quando: contato sem `opt_in`, contato em `opt_outs`, estoque insuficiente, template não `aprovado`, número `inativo` ou sem `access_token`.
- Tokens nunca retornados para o cliente em listas (apenas no editor do próprio número, mascarados).
- `access_token` armazenado no banco; deixo comentário recomendando rotação manual.

## Não vou fazer (fora do MVP)

- Multi-WABA por cliente com seletor — estrutura preparada, UI usa 1:1.
- Worker dedicado (BullMQ/Redis) — fica simulado via `pg_cron` tick.
- Editor visual de template com upload de mídia para a Meta — só metadata.
- Dashboard TV em tempo real para WhatsApp.
- White-label.

## Ordem de execução

1. Migração única do banco (estende + cria tudo, com GRANT/RLS).
2. Server fns + service de envio + webhook + worker tick.
3. UI Números → Templates → Contatos/Listas → Campanhas WA wizard → Inbox → Logs.
4. Ajustes em Estoque, Financeiro e Dashboard.
5. `pg_cron` agendando o tick a cada minuto.

Confirma para eu iniciar pela migração?
