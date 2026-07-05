## 1. Configuração de preço por disparo

**Admin — nova tela `/admin/precificacao`** (dedicada, separada de Financeiro)
- Card "Preço global padrão" editável: R$/mensagem, mínimo de mensagens, depósito mínimo (grava em `billing_settings`).
- Lista de workspaces com preço padrão vs. custom, edição inline (reutiliza `adminSetCustomPrice` / `adminSetCustomMinimumMessages` já existentes).
- Simulador: "Depósito X → Y disparos" com preço efetivo do workspace selecionado.

**Painel do cliente — `/painel/financeiro`**
- Exibir preço efetivo (R$ 0,23 ou custom), quantos disparos o saldo atual comporta, e calculadora "quero enviar N mensagens → preciso de R$ X".
- Badge "preço promocional" quando `custom_price_cents < default_price_cents`.

Cálculos já usam `wallet_effective_price()` — só melhorar a UI.

## 2. Página pública da campanha com iframe fullscreen

- `src/routes/$slug.tsx` passa a renderizar `<iframe>` fullscreen 100dvh × 100vw carregando `destination_url`, com sandbox e allow apropriados.
- Preserva o tracking atual (registro em `campaign_clicks` no server-side antes do iframe montar) e injeta UTMs.
- Fallback quando `iframe_compatible === false`: redirect direto para `destination_url` via `<meta refresh>` + botão manual.
- SEO / OG tags continuam vindo de `head()` no servidor.
- Sem chrome/header/footer — só o iframe.

## 3. Mini-charts em tempo real por campanha

Novo componente `<CampaignAnalytics campaignId={...} />` (usa `recharts`, já instalado) com:
- KPIs no topo: cliques totais, únicos, CTR, países, dispositivos.
- Line chart de cliques por hora (últimas 24h).
- Donut: país (top 5), device (mobile/desktop/tablet), browser (top 5).
- Tabela top 10 cidades.

Fonte: `campaign_clicks` (26 colunas — já tem country, city, device, browser, user_agent). Nova server fn `getCampaignAnalytics(campaign_id, workspace_id)` com RLS por workspace.

Refetch a cada 15 s + `postgres_changes` no channel realtime da tabela para atualização instantânea.

Embutido em:
- `/admin/campaigns/$id` (cloaker) e `/admin/whatsapp-campanhas/$id` (WhatsApp).
- `/painel/campanhas` — abrir modal/drawer de analytics ao clicar em uma campanha.

## 4. Sistema de notificações in-app

**Backend (migração)**
- Tabela `public.notifications` (workspace_id, user_id nullable, kind, title, body, link, severity, is_read, created_at) com RLS por workspace e realtime habilitado.
- Trigger em `wa_campaigns`: notifica criação, mudanças de status (`scheduled`, `running`, `completed`, `failed`, `paused`).
- Trigger em `campaign_clicks` de falha de coleta (quando `country IS NULL AND user_agent IS NOT NULL` marca warning agregado — via função `notify_click_collection_issue`).
- Função `notify_workspace(_ws, _kind, _title, _body, _link, _severity)`.

**Frontend**
- Componente `<NotificationsBell />` no header do painel: badge com contagem não-lidas, popover com últimas 20, marcar como lida, "ver todas".
- Assinatura realtime em `notifications` filtrada por `workspace_id`, toast automático em novas notificações críticas.
- Rota `/painel/notificacoes` para histórico completo.

## Ordem de execução (2 migrações + código)

1. Migração 1: tabela `notifications` + triggers + realtime.
2. Migração 2: (nenhuma outra — pricing já existe).
3. Server fns novas: `getCampaignAnalytics`, `listMyNotifications`, `markNotificationRead`, `getBillingPreview`.
4. Componentes: `CampaignAnalytics`, `NotificationsBell`, `PricingCalculator`.
5. Rotas novas: `/admin/precificacao`, `/painel/notificacoes`.
6. Refactor: `$slug.tsx`, `painel.financeiro.tsx`, headers do painel.

## Fora do escopo (para não inflar)

- Notificações por e-mail / push.
- Editar preço por campanha individual (fica no nível workspace).
- Heatmap geográfico com mapa — só top listas + donut.
- Multi-idioma dos textos das notificações.
