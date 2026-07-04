
# Plataforma WhatsApp Business — Disparos FR

Escopo: entrega tudo em uma leva, evoluindo tabelas existentes. Token único global no Secret `WHATSAPP_ACCESS_TOKEN` (já configurado). Nada de burlar limites da Meta, nada de disparo sem opt-in, tokens nunca no frontend.

## 1. Banco de dados (evolução, sem quebrar dados atuais)

### Nova tabela
- `whatsapp_wabas` — nome_interno, client_id, project_id, business_id, waba_id (único), status, observacoes, created_at.

### Evolução de tabelas existentes
- `whatsapp_connections` (Números): adicionar `waba_ref_id → whatsapp_wabas.id`, `business_id`, `quality_rating`, `messaging_limit`, `display_name`, `nome_interno`.
- `whatsapp_templates`: adicionar `waba_ref_id`, `meta_template_id`, `rejection_reason`, `submitted_at`, `reviewed_at`, `header_type`, `header_text`, `header_media_url`, `footer`, `buttons_json`, `variables_examples_json`, `history_json`.
- `wa_campaigns`: adicionar `waba_ref_id` (número já existe via phone_number_id/nome_number).
- `whatsapp_webhook_logs`: já existe — só usado como está.
- `opt_outs`: já existe — webhook grava aqui.

### Não criar
- `whatsapp_tokens` — decidido usar Secret global (`WHATSAPP_ACCESS_TOKEN`). Painel mostra só "Token configurado (Secret)".

Migrations com GRANT + RLS `admin`-only nas novas tabelas.

## 2. Módulos (rotas em `/admin/whatsapp-*`)

Reaproveita layout atual (`admin.whatsapp-*.tsx`).

- **WABAs** (`/admin/whatsapp-wabas`) — CRUD, listar números/templates/campanhas vinculadas.
- **Números** (evolui `admin.whatsapp-numeros`) — vincular a WABA, mostrar quality/limit, botão "Testar envio", "Ver campanhas", "Ver logs".
- **Templates** (evolui `admin.whatsapp-templates`) — CRUD completo com header/body/footer/botões/variáveis+exemplos, preview, validação, **Enviar para aprovação**, **Consultar status**, duplicar, arquivar, histórico.
- **Campanhas** (evolui `admin.whatsapp-campanhas`) — já usa WABA/número/template; adicionar seletor de WABA e filtro de templates aprovados dessa WABA. Mantém envio 40/s. Opt-in obrigatório: bloqueia contatos em `opt_outs`.
- **Webhooks** (`/admin/whatsapp-webhooks`) — lista URLs de callback (mostra a URL pública fixa deste projeto), verify token, últimos eventos, logs, erros.
- **Relatórios** (`/admin/whatsapp-relatorios`) — filtros por WABA/número/cliente/projeto/template/campanha/período; métricas enviados/accepted/delivered/read/failed/respostas/opt-outs/custo/receita/lucro/taxas.
- **Embedded Signup** (`/admin/whatsapp-embedded-signup`) — placeholder com botão "Conectar WhatsApp" desabilitado + explicação e campos onde os IDs retornados serão salvos (estrutura pronta, integração Meta em fase posterior).

## 3. Backend (server functions + rota pública)

### `src/lib/wa-meta.functions.ts` (novo — API oficial Meta v20)
- `submitTemplate({ wabaId, template })` — monta payload correto (components header/body/footer/buttons + `example`), chama `POST /{waba-id}/message_templates`, salva resposta completa em `whatsapp_webhook_logs`, atualiza `meta_template_id`+status.
- `fetchTemplateStatus({ wabaId, metaTemplateId })` — `GET /{template-id}` e atualiza status/rejection_reason/reviewed_at.
- `fetchWabaNumbers({ wabaId })` — `GET /{waba-id}/phone_numbers` (quality, limit, display_name).
- `sendTestMessage({ phoneNumberId, to, templateName, language })` — envio de teste 1:1.
- Tratamento de erro Meta com códigos: token inválido (190), sem permissão (10/200), nome duplicado (192xx), categoria inválida, variável sem sample, botão inválido, mídia inválida, fallback genérico. Mensagens em PT.
- Todas as funções usam `process.env.WHATSAPP_ACCESS_TOKEN` (nunca vai ao client) e `.middleware([requireSupabaseAuth])` + checagem `has_role(admin)`.

### Rota pública `/api/public/whatsapp-webhook` (novo)
- `GET` — validação `hub.mode=subscribe` com `hub.verify_token` = `WHATSAPP_VERIFY_TOKEN` (novo secret gerado).
- `POST` — grava payload bruto em `whatsapp_webhook_logs`, atualiza status em `campaign_recipients`/`message_logs` por `meta_message_id`, salva respostas no inbox, detecta opt-out (regex `sair|parar|cancelar|remover|não quero|nao quero`) e insere em `opt_outs`.

## 4. Segurança
- Token só em Secret + server functions. Nenhum endpoint retorna o token.
- RLS `admin`-only em WABAs, tokens (info), webhooks; leituras normais via `has_role`.
- Opt-in: envio bloqueia recipient cujo telefone esteja em `opt_outs`.
- Logs completos: toda ação sensível (submit template, envio, webhook) grava em `whatsapp_webhook_logs` ou `activity_logs`.
- Nenhuma função para contornar rate/quality limits da Meta.

## 5. Sidebar / navegação
Adicionar seção "WhatsApp Platform" agrupando: WABAs · Números · Templates · Campanhas · Webhooks · Relatórios · Embedded Signup.

## 6. Fora do escopo desta entrega (documentado no painel)
- Embedded Signup real da Meta (só estrutura visual/DB).
- Permissões finas por ação (usa hoje `admin` unificado).
- White-label por cliente.

## Ordem de execução
1. Migration (whatsapp_wabas + colunas novas + índices + RLS + GRANT).
2. Secret `WHATSAPP_VERIFY_TOKEN`.
3. Backend: `wa-meta.functions.ts` + rota webhook pública.
4. Telas: WABAs → Números (evolução) → Templates (evolução) → Campanhas (ajuste seletor) → Webhooks → Relatórios → Embedded Signup.
5. Item de menu na sidebar.

Confirma para eu começar?
