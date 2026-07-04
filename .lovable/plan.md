# Ajuste de modelo — SaaS "White-glove WhatsApp"

Neste modelo, **só o admin** possui BMs, WABAs, números e tokens. Clientes se cadastram, recebem números/templates liberados e disparam campanhas dentro desse pool controlado, com saldo, opt-in/opt-out e (opcionalmente) aprovação interna.

Reaproveita 100% do que já existe (`whatsapp_wabas`, `whatsapp_connections`, `whatsapp_templates`, `wa_campaigns`, `message_stock`, workspaces, roles). Nada é removido do `/admin`.

---

## 1. Modelo de dados (migration única)

### 1.1 Números — disponibilidade para clientes
Adicionar em `whatsapp_connections`:
- `display_name text` (nome público mostrado ao cliente)
- `visibility text check in ('internal','shared','exclusive')` default `'internal'`
- `daily_cap int` (limite interno diário por número)
- `paused_at timestamptz` (pausa manual de novos disparos)
- `quality_visible_to_client bool` default `false`
- `notes text`

Nova tabela `whatsapp_number_grants`:
- `connection_id`, `workspace_id`, `project_id` (nullable), `granted_by`, `created_at`
- unique(`connection_id`,`workspace_id`,`project_id`)

Regra de resolução: visibility=`exclusive` exige grant específico; `shared` requer grant; `internal` só staff.

### 1.2 Templates — liberação por cliente/número
Adicionar em `whatsapp_templates`:
- `visibility text check in ('internal','shared','exclusive')` default `'internal'`

Nova tabela `whatsapp_template_grants`:
- `template_id`, `workspace_id` (nullable), `connection_id` (nullable), `created_at`

Nova tabela `whatsapp_template_requests` (cliente solicita template novo):
- `workspace_id`, `requested_by`, `name`, `category`, `language`, `body`, `variables jsonb`, `buttons jsonb`, `header_media_type`, `status text` (`rascunho|em_revisao|enviado_meta|aprovado|rejeitado`), `admin_notes`, `created_template_id` (fk após criação), timestamps.

### 1.3 Campanhas — aprovação e número escolhido
Em `wa_campaigns`:
- `workspace_id uuid` (backfill via `client_id`→workspace do owner; depois NOT NULL)
- `connection_id uuid` (número remetente escolhido)
- `approval_mode text check in ('auto','manual')` default `'auto'`
- `approval_status text check in ('not_required','pending','approved','rejected')` default `'not_required'`
- `approved_by uuid`, `approved_at`, `rejection_reason text`
- Ampliar enum `status` com: `awaiting_approval`, `approved`, `rejected`, `blocked`

Em `workspaces`:
- `approval_mode text` default `'auto'` (política padrão do cliente/plano)
- `blocked_at timestamptz`, `block_reason text`

### 1.4 Saldo (reaproveita `message_stock`)
Nova tabela `message_stock_reservations`:
- `campaign_id`, `workspace_id`, `qty_reserved int`, `qty_consumed int`, `status` (`held|consumed|released`), timestamps.

Fluxo: ao iniciar campanha reserva `total_recipients`; ao aceitar/enviar consome; ao cancelar/falhar em massa devolve saldo.

### 1.5 RLS (todas as tabelas)
- Cliente: `workspace_id IN user_workspace_ids(auth.uid())`
- Staff interno: `is_internal_staff(auth.uid())` libera tudo
- Grants: cliente só lê grants do próprio workspace
- Tokens/App Secret/Phone Number ID sensível: **nenhuma policy SELECT para authenticated** — só backend service role

### 1.6 Views seguras para o cliente
- `v_client_numbers` (WITH security_invoker=on): projeta apenas `id, display_name, phone_masked, status, quality (se permitido), daily_cap_available, paused` — sem token, sem WABA ID, sem Phone Number ID.
- `v_client_templates`: `id, name, category, language, body_preview, variables, buttons` — sem meta IDs.

---

## 2. Server functions (todas com `requireSupabaseAuth` + checagem de workspace)

`src/lib/client-panel.functions.ts`:
- `listMyNumbers({ workspace_id, project_id? })` → lê `v_client_numbers` filtrando por grants
- `listMyTemplates({ workspace_id, connection_id? })` → lê `v_client_templates` filtrando por grants
- `getMyBalance({ workspace_id })` → usa `wa_available_stock`
- `createTemplateRequest(...)`
- `createCampaign(...)` → valida grants, saldo, opt-in, template aprovado, número ativo, cliente não bloqueado; grava com `approval_status` conforme `workspaces.approval_mode`
- `startCampaign({ campaign_id })` → se `auto` inicia direto; se `manual` marca `awaiting_approval`

`src/lib/admin-whatsapp.functions.ts`:
- `grantNumberToWorkspace / revokeNumberGrant`
- `grantTemplateToWorkspace / revokeTemplateGrant`
- `approveCampaign / rejectCampaign(reason)`
- `pauseCampaign / cancelCampaign / reprocessFailures`
- `blockWorkspace / unblockWorkspace`
- `reviewTemplateRequest / submitTemplateRequestToMeta`

Todo `handler` dispatcher existente (`sendCampaign`, webhook) passa a debitar/creditar `message_stock_reservations` e respeitar `daily_cap` + `paused_at` do número.

---

## 3. Rotas

### `/admin` (staff) — adiciona
- `/admin/numeros` — CRUD dos números com aba **Liberações** (grants por workspace/projeto), visibility, daily cap, pause, notes
- `/admin/templates` — aba **Liberações** + fila de `whatsapp_template_requests`
- `/admin/campanhas-aprovacao` — fila de `awaiting_approval` com aprovar/rejeitar/trocar número
- `/admin/clientes/[id]` — aba **Números liberados**, **Templates liberados**, **Estoque**, **Modo de aprovação**, **Bloquear**

Telas existentes permanecem intactas.

### `/painel` (cliente)
- `/painel` — dashboard: saldo, últimas campanhas, alertas
- `/painel/contatos`, `/painel/listas`
- `/painel/templates` — lista dos liberados + botão "Solicitar novo template"
- `/painel/campanhas` — lista filtrada por workspace
- `/painel/campanhas/nova` — wizard 7 etapas (Dados → Público → Número → Template → Variáveis → Revisão → Envio)
- `/painel/relatorios`
- `/painel/configuracoes` (perfil, membros do workspace)
- **Sem** telas de conexão WhatsApp / BM / token

### `/` (público)
- Mantém landing já criada; ajustar copy para deixar claro: "Nós cuidamos da infraestrutura oficial Meta. Você só dispara." Sem prometer "ilimitado" ou "burlar bloqueios".

---

## 4. Wizard de nova campanha (`/painel/campanhas/nova`)

Passos exatamente como especificado. Regras-chave:
- Etapa 3: `listMyNumbers` — se retornar 1, auto-seleciona; se 0, bloqueia com CTA "Solicitar liberação ao suporte"
- Etapa 4: `listMyTemplates(connection_id)` — filtra por grants do número + workspace
- Etapa 5: reaproveita `wa-variables.ts` já existente (fallback `{campo|default}` já suportado)
- Etapa 6: chama `getMyBalance` + `estimateCost` — bloqueia se saldo insuficiente
- Etapa 7: `startCampaign` respeita `approval_mode`

---

## 5. Status e transições

```text
rascunho ─▶ awaiting_approval ─▶ approved ─▶ scheduled|queued ─▶ running ─▶ paused|completed|cancelled|failed
       └───────────(auto)─────────────────────┘
       └──────▶ rejected (com motivo)
```

Admin pode: aprovar, rejeitar, trocar número antes de `running`, pausar, cancelar, reprocessar falhas.

---

## 6. Segurança
- Nenhuma tabela com token/app_secret exposta ao role `authenticated`
- `client.ts` browser nunca lê `whatsapp_connections` cru — só as views
- Todos servers fns validam `workspace_id ∈ user_workspace_ids(auth.uid())` antes de qualquer operação
- Bloqueio: se `workspaces.blocked_at IS NOT NULL`, `createCampaign` e `startCampaign` rejeitam
- Rate/daily cap: dispatcher consulta `daily_cap` do número + envios do dia; se estourar, pausa e loga
- Opt-in obrigatório: recipient só entra se `opt_in=true` (respeitando `opt_outs`)

---

## 7. Ordem de execução

**Fase A — Backend (uma migration):** todas as colunas, tabelas, views, RLS, grants, enum extension.
**Fase B — Server fns admin:** grants de número/template, aprovação, template requests.
**Fase C — Server fns cliente + views:** listagens seguras, saldo, criar/iniciar campanha.
**Fase D — Telas admin novas:** `/admin/numeros` (aba liberações), fila de aprovação, fila de templates.
**Fase E — Painel cliente:** wizard 7 etapas + templates + relatórios (reaproveitando componentes de `/admin`).
**Fase F — Dispatcher:** reservar/consumir/devolver saldo, respeitar `daily_cap`, `paused_at`, bloqueio de workspace.
**Fase G — Copy da landing** ajustada ao novo posicionamento.

---

## Perguntas antes de começar

1. **Valores dos 4 planos** (Starter / Growth / Scale / Enterprise) — ainda preciso para a landing e para o seed de `workspaces.plan`.
2. **Modo de aprovação default** para novos cadastros: `auto` (cliente dispara direto) ou `manual` (toda campanha passa por você)?
3. **Cliente pode solicitar template novo** já no MVP, ou só usa os que você libera?
4. Posso seguir direto para **Fase A (migration)** assim que responder as 3 acima?
