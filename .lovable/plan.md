
## Objetivo

Transformar a agenda atual num sistema funcional de agendamento de campanhas WhatsApp com visualização mês/semana/dia, execução automática, controle de conflitos, histórico e sincronização bidirecional de eventos com Google Calendar.

Já existe hoje: tabela `wa_campaigns` com `scheduled_at`, `calendar_events` já ligada a `wa_campaigns.campaign_id`, wizard de nova campanha aceita `scheduled_at`, botão "Agendar disparo" na agenda, sync one-way manual para Google via connector, executor em `wa-queue.server.ts` e cron `queue-tick`. Vou construir em cima disso, sem duplicar.

---

## 1. Banco de dados (1 migração)

**`wa_campaigns`** — adicionar:
- `timezone text default 'America/Sao_Paulo'`
- `rate_config jsonb` (intervalo, lote, pausa — se ainda não existir campo equivalente)
- `google_event_id text`, `google_calendar_id text`, `google_synced_at timestamptz`
- `paused_at timestamptz`, `error_reason text`

**`campaign_audit_log`** (nova) — histórico de alterações:
- `id, campaign_id, workspace_id, actor_id, action` (`created|edited|rescheduled|paused|resumed|cancelled|duplicated|started|completed|failed`), `from_data jsonb`, `to_data jsonb`, `message text`, `created_at`
- RLS: workspace members leem; service_role escreve.

**`workspace_google_calendar`** (nova, per-workspace ou per-user) — conexão Google:
- `id, workspace_id unique, user_id, calendar_id text, calendar_name text, refresh_token text (encrypted), access_token text, token_expires_at timestamptz, auto_sync bool default true, connected_at timestamptz`
- RLS: apenas owner/admin do workspace.

**Índice de conflito** em `wa_campaigns`:
- Índice `(connection_id, scheduled_at)` + função `wa_check_scheduling_conflict(_connection_id, _scheduled_at, _duration_min, _exclude_id)` que retorna campanhas em conflito na janela.

---

## 2. Backend — server functions (`src/lib/`)

### `wa-schedule.functions.ts` (novo)
- `scheduleCampaign({ campaign_id, scheduled_at, timezone, force })` — valida conflito, atualiza status→`scheduled`, grava auditoria, dispara sync Google.
- `rescheduleCampaign({ campaign_id, new_scheduled_at, reason })`
- `duplicateCampaign({ campaign_id, new_name?, new_scheduled_at? })` — copia template/lista/config, novo draft.
- `pauseCampaign`, `resumeCampaign`, `cancelCampaign` — todos gravam auditoria + atualizam Google.
- `checkSchedulingConflict({ connection_id, scheduled_at, exclude_id? })` — usado no wizard.
- `listScheduledCampaigns({ from, to, status?, connection_id?, template_id? })` — feed unificado do calendário.
- `getCampaignAuditLog({ campaign_id })`.

### `google-calendar.functions.ts` (novo, per-workspace OAuth)
- `getGoogleAuthUrl()` — retorna URL OAuth2 (offline + prompt=consent).
- Server route `/api/public/google/oauth-callback` — troca code por tokens, salva em `workspace_google_calendar`.
- `disconnectGoogleCalendar()`, `listGoogleCalendars()`, `setActiveCalendar({ calendar_id })`, `setAutoSync({ enabled })`, `getGoogleConnection()`.
- `syncCampaignToGoogle({ campaign_id })` / `deleteCampaignFromGoogle({ campaign_id })` — helpers internos, refresh de token, chamadas Calendar API v3.

Requer secrets `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (pediremos via add_secret).

### `wa-queue.server.ts` (existente) — reforçar pré-flight
No tick, para cada `scheduled` cujo `scheduled_at <= now()`:
1. Conexão ativa? Token válido? Template `APPROVED`? Lista com contatos? Saldo suficiente? Conflito?
2. Falhou → `status='failed'`, `error_reason=...`, auditoria + notificação `campaign.failed`.
3. OK → status→`running`, auditoria + notificação `campaign.started`, prossegue.

### Notificações (reusa `notify_workspace`)
Trigger em `wa_campaigns` (upgrade do `trg_notify_wa_campaign` existente) para novos eventos: `scheduled`, `starting_soon` (via cron a T-10min), `paused`, `cancelled`, `failed` com `error_reason` no body.

### Cron
Novo hook `/api/public/hooks/notify-upcoming-campaigns` (a cada 5min) que emite notificações "próxima de iniciar" para campanhas em T-10min. Agendado no `pg_cron`.

---

## 3. Frontend

### Nova página `/painel/agenda` (`src/routes/painel.agenda.tsx`)
Calendário completo usando **FullCalendar React** (`@fullcalendar/react` + daygrid/timegrid/list). Views: Mês / Semana / Dia / Próximos. Eventos coloridos por status. Data source: `listScheduledCampaigns` no range visível.

Clique no evento → `CampaignEventDrawer` (Sheet lateral) mostrando: nome, connection (com máscara), template, lista, contatos, status, agendado para (com fuso), timeline de auditoria compacta. Botões: Ver, Editar, Reagendar (datetime picker), Duplicar, Pausar/Retomar, Cancelar, Excluir.

### Wizard de nova campanha (`painel.campanhas.nova.tsx`)
Adicionar passo/campos:
- Radio: **Enviar agora** / **Agendar** / **Salvar rascunho**
- Se Agendar: datetime-local + Select de fuso (Intl timezone list, default `America/Sao_Paulo`)
- Passo "Configurações": intervalo, lote, pausa (edita `rate_config`)
- Checagem live de conflito (`checkSchedulingConflict`) mostra badge de alerta com CTAs "Forçar" / "Escolher outro horário"
- Resumo final com todos os campos + fuso

### Listagem de campanhas (`painel.campanhas.tsx`)
Adicionar ação **Duplicar** e coluna "Agendada para".

### Dashboard principal (`painel.index.tsx`)
Card **"Próximos disparos"** (top 5 por `scheduled_at asc` com status `scheduled`).

### Histórico (`/painel/campanhas/historico` — nova)
Tabela com filtros por Data, Campanha, Número, Template, Status, Usuário. Cada linha expansível mostra o `campaign_audit_log`.

### Configurações → Google Calendar (`painel.configuracoes.tsx`)
Nova seção "Google Calendar":
- Se desconectado: botão **Conectar Google Calendar** (abre popup OAuth).
- Se conectado: mostra e-mail/conta, Select do calendário, toggle **Sincronização automática**, botão **Desconectar**.

### Notificações
Já existe `NotificationsBell`; novos `kind`s aparecem automaticamente. Adicionar ícones/severity por kind.

---

## 4. Google Calendar OAuth (per-workspace)

Fluxo:
1. Usuário clica Conectar → GET `getGoogleAuthUrl()` → `window.open` no consent Google.
2. Callback `/api/public/google/oauth-callback?code=...&state=<workspace_id_signed>` valida `state` (HMAC), troca code por tokens, lista calendários, salva default como `primary`, redireciona para `/painel/configuracoes?gcal=ok`.
3. Sync helper refresha token quando `expires_at < now()+60s`.
4. Toda mudança em campanha (schedule/reschedule/cancel/delete) chama `syncCampaignToGoogle` se `auto_sync=true` e há conexão.
5. Descrição do evento inclui link deep `https://<domain>/painel/campanhas/{id}`.

---

## 5. Execução automática — reforços

`wa-queue.server.ts` já processa fila. Ajustes:
- Nova função `preflightCampaign(campaign_id)` centraliza as 6 validações.
- Executor pega `status='scheduled' AND scheduled_at <= now()` primeiro; roda `preflightCampaign`; se OK → `running`; senão → `failed` com `error_reason`.
- Registra auditoria em cada transição.

---

## 6. Detecção de conflito

`wa_check_scheduling_conflict(connection_id, scheduled_at, duration_min := 30, exclude_id := null)`:
```sql
SELECT id, name, scheduled_at FROM wa_campaigns
WHERE connection_id = _connection_id
  AND status IN ('scheduled','running','paused')
  AND id <> COALESCE(_exclude_id, '00000000-...'::uuid)
  AND scheduled_at BETWEEN (_scheduled_at - (duration_min||' min')::interval)
                       AND (_scheduled_at + (duration_min||' min')::interval);
```
Usada tanto no wizard quanto no `scheduleCampaign` (bloqueia salvo `force=true`, que só admins ou owner podem passar).

---

## 7. Ordem de implementação

1. Migração (schema + `campaign_audit_log` + `workspace_google_calendar` + função de conflito + trigger de notificação).
2. `wa-schedule.functions.ts` + reforço no `wa-queue.server.ts`.
3. Wizard de nova campanha atualizado (fuso, modo, config, conflito).
4. Página `/painel/agenda` com FullCalendar + drawer.
5. Histórico e coluna "Duplicar" na listagem.
6. Card "Próximos disparos" no dashboard.
7. Google Calendar: secrets, server route callback, seção em Configurações, sync automático em todos os pontos de mudança.
8. Cron de "próxima de iniciar" + notificações.

---

## Detalhes técnicos

- FullCalendar: instalar `@fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list @fullcalendar/interaction`.
- Fuso: guardar sempre em UTC no banco; exibir com `Intl.DateTimeFormat` no timezone da campanha.
- Refresh token do Google armazenado em texto (Supabase é privado; se quiser criptografia adicional posso usar `pgcrypto`).
- Todo estado em `wa_campaigns.status` como fonte da verdade; `calendar_events` fica só para eventos manuais (reunião etc.) — não duplicaremos campanhas nela; a Agenda lê direto de `wa_campaigns` e mescla com `calendar_events` que não têm `campaign_id`.

## Secrets necessários (pedirei depois)

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- Redirect URI configurada no Google Cloud: `https://<seu-domínio>/api/public/google/oauth-callback` (produção) + a de dev.

## O que fica de fora

- App mobile / push nativo (fica nas notificações in-app já existentes).
- Editor visual drag-and-drop do calendário para reagendar arrastando (viável, mas se quiser confirmo depois — plano cobre reagendar via botão).
