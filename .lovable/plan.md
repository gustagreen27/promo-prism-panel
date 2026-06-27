# Painel SaaS Admin — Gestão Financeira/Operacional

Vou construir um painel administrativo dark premium com 13 módulos, integrado ao módulo de campanhas já existente (que vira o "Upsell"). Mantém todo o trabalho atual (campanhas, slug público, tracking, intent) e adiciona a estrutura SaaS por cima.

## Escopo

### Layout base
- **Sidebar fixa** com grupos: VISÃO GERAL, FINANCEIRO, OPERACIONAL, CADASTROS, FERRAMENTAS, SISTEMA.
- Rodapé sidebar: exportar e logout.
- Tema dark elegante (ajustar tokens em `src/styles.css`).
- Cards com cor semântica por indicador (azul/verde/vermelho/amarelo/roxo via tokens).
- Responsivo (sidebar colapsa em mobile via shadcn Sidebar).

### Banco de dados (1 migração)
Tabelas em `public`: `clients`, `projects`, `revenues`, `costs`, `calendar_events`, `message_stock`, `whatsapp_connections`, `whatsapp_messages`, `closings`, `upsell_campaigns` (linkada a `campaigns` existente), `activity_logs`, `settings`. Cada uma com RLS admin-only via `has_role`, GRANTs corretos, triggers `updated_at`.

### Rotas (`src/routes/_authenticated/`)
- `index.tsx` → Dashboard (já existe; será substituído pelo Dashboard novo; a lista de campanhas vira `/upsell`).
- `faturamento.tsx`, `custos.tsx`, `agenda.tsx`, `fechamento.tsx`, `historico.tsx`, `estoque.tsx`, `whatsapp.tsx`, `clientes.tsx`, `projetos.tsx`, `upsell.tsx`, `configuracoes.tsx`.
- `dashboard-tv.tsx` (fullscreen, sem sidebar — rota separada `_authenticated/tv.tsx` sem layout).

### Componentes reutilizáveis
- `MetricCard` (color variant, valor, subtexto, ícone)
- `EmptyState`
- `DataTable` (busca, filtros, paginação)
- `ConfirmDialog`
- `MoneyInput`, `formatBRL`
- `PeriodFilter` (Hoje, Ontem, 7d, 30d, mês, personalizado)
- `AppSidebar` com grupos

### Server functions (`src/lib/<modulo>.functions.ts`)
Um arquivo CRUD por módulo usando `requireSupabaseAuth` + RLS admin. Inclui agregações para Dashboard, Fechamento e Dashboard TV.

### Integração com Upsell
A página `/upsell` lista `campaigns` existentes + métricas agregadas de `campaign_clicks`. Mantém todas as rotas de campanha (`/$slug`, editor, preview).

### Histórico automático
Helper `logActivity()` chamado nos CRUDs de cada módulo.

## Premissas
- Dashboard TV atualiza a cada 30s via `setInterval` + `queryClient.invalidateQueries`.
- Uploads de comprovantes → bucket privado `attachments` + rota proxy similar ao `ci.$.tsx`.
- Sem dados mockados; estados vazios bonitos em todos os módulos.
- Moeda BRL em `formatBRL`.

## Entregas em ondas
Dado o volume (13 módulos + 12 tabelas), proponho fazer em **3 ondas dentro deste mesmo chat**, cada uma autoexecutada na sequência:

**Onda A — Fundação (esta resposta após aprovação)**
- Migração com as 12 tabelas + RLS + GRANTs.
- Sidebar nova + layout `_authenticated/route.tsx` atualizado.
- Componentes base (`MetricCard`, `EmptyState`, `DataTable`, `PeriodFilter`, `formatBRL`, `ConfirmDialog`).
- Dashboard funcional (cards + meta + últimos fechamentos/faturamentos).
- CRUD Clientes + Projetos (mais críticos, base das outras telas).

**Onda B — Financeiro e operacional**
- Faturamento, Custos, Fechamento, Agenda, Estoque de Msgs.

**Onda C — Comunicação, ferramentas e sistema**
- WhatsApp, Histórico, Upsell (integrado com campanhas), Dashboard TV, Configurações.

Confirma que sigo com a **Onda A** agora?
