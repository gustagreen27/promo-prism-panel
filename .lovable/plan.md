
# Redesign SaaS + Wizard de Campanhas

Paleta **Cloud White (Stripe-like)** · **light-only** · entrega em uma leva.
Nada é removido — só reagrupado, renomeado ou visualmente refinado.

---

## 1. Design system (`src/styles.css`)

Novos tokens em `oklch`:
- `--background` branco levíssimo, `--surface` #fafbfc, `--surface-2` #f4f6f9
- `--border` #e5e7eb / `--border-strong` #d1d5db
- `--primary` #3b82f6 (azul Stripe-like), `--primary-foreground` branco
- `--success` #10b981 · `--warning` #f59e0b · `--danger` #ef4444 · `--info` #0ea5e9
- Radius base 10px · sombra sutil `--shadow-card`, `--shadow-elevated`
- Tipografia: **Inter Tight** (headings) + **Inter** (body), via `@fontsource`
- Utilitários novos: `.card-premium`, `.stat-card`, `.data-table`, `.section-title`, `.pill`

Sem dark mode; removo troca de tema onde existir.

## 2. Sidebar reagrupada (`src/components/admin/app-sidebar.tsx`)

Grupos exatamente como pediu:

```
Dashboard
WhatsApp        WABAs · Números · Templates · Embedded Signup · Webhooks · Inbox · Logs
Campanhas       Todas · Nova · Agendadas · Em andamento · Concluídas · Relatórios
Clientes        Clientes · Projetos · Contatos · Listas · Tags · Segmentos
Financeiro      Faturamento · Custos · Estoque · Fechamentos · Histórico
Relatórios      Geral · Por cliente · Por campanha · Por número · Por template · Por responsável
Sistema         Configurações · Permissões · Usuários · Tokens/Secrets · Logs
```

Grupos expansíveis, item ativo destacado, mini-collapse com ícones. Rotas existentes são reaproveitadas; novas rotas de filtro (agendadas/em andamento/concluídas, relatórios segmentados) são páginas leves que reusam o listado atual com filtro pré-aplicado — sem duplicar módulos.

## 3. Dashboard novo (`/admin`)

Substitui a home atual. 4 stat cards (Mensagens do mês, Taxa de entrega, Faturamento, Lucro) + 2 gráficos (envios/dia, entrega vs falha) + tabela "Campanhas em andamento" + painel "Alertas" (opt-outs recentes, tokens expirando, qualidade caindo, estoque baixo). Tudo alimentado por server fns já existentes (`wa-reports`, `wa-campaigns`).

## 4. Componentes premium reutilizáveis

- `StatCard`, `PageContainer`, `SectionHeader`, `EmptyState` (refinado), `DataTable` wrapper com zebra opcional, `StatusBadge` (mapeia todos os status: ativo/pendente/erro/aguardando_verificacao/aprovado/rejeitado/…), `Stepper` para wizards.
- Aplicados em todas as telas existentes de WhatsApp/Clientes/Financeiro sem mexer na lógica.

## 5. Wizard de Nova Campanha (`/admin/campanhas/nova`)

Rota nova com `Stepper` de 7 etapas. Substitui só a criação — a listagem atual permanece.

**E1 – Dados**: nome · cliente · projeto · responsável · data/hora · imediato/agendado
**E2 – Público**: lista de contatos · filtro por tags · dedup automática · exclusão de opt-outs · contador de destinatários em tempo real (server fn `previewAudience`)
**E3 – WhatsApp**: WABA → carrega números → carrega templates aprovados dessa WABA. Exibe qualidade, tier de limite, status, idioma, categoria, preview do template.
**E4 – Variáveis** (o coração): para cada `{{n}}` do template, editor com tokens dinâmicos:
- Campos disponíveis: `{nome}`, `{primeiro_nome}`, `{telefone}`, `{email}`, `{cliente}`, `{projeto}`, `{protocolo}`, `{codigo_comprovante}`, `{data}`, `{link}`, `{responsavel}`, `{empresa}` + **campos personalizados por campanha**
- Sintaxe de fallback: `{primeiro_nome|cliente}` — se vazio usa o próximo, se todos vazios usa string literal final
- Texto fixo + tokens: `"Olá {primeiro_nome|amigo}, como você está?"`
- Preview em tempo real com contato exemplo (escolhido da lista)
- Botão "Testar com um contato" (envia via server fn existente, aparece como mensagem única)
- Validação: variáveis obrigatórias, contatos que não possuem o campo → aviso e opção "usar valor padrão"

**E5 – Botões / URL dinâmica**: se o template tem botão URL com `{{1}}`, mesmo editor com tokens; suporta prefixo fixo + token (`comprovante/{codigo_comprovante}`)

**E6 – Revisão**: card grande com prévia final da mensagem renderizada, botão renderizado, cliente, projeto, número, template, lista, total destinatários, estimativa de custo, estoque disponível, alertas (opt-outs removidos, contatos sem campos obrigatórios, contatos inválidos)

**E7 – Envio**: cria a campanha (`insertCampaign` já existente), enfileira (`wa-queue.server`), tela de progresso com controles Iniciar/Pausar/Retomar/Cancelar e counters em tempo real (enviadas · aceitas · entregues · lidas · falhas · respostas)

### Backend do wizard (novo `src/lib/wa-wizard.functions.ts`)

- `previewAudience({ list_id, tag_ids, exclude_optouts })` → conta e amostra
- `renderVariables({ template_id, mapping, contact_id })` → renderiza preview
- `sendTestMessage({ number_id, template_id, mapping, contact_id })` → envio pontual
- `createCampaignFromWizard({...})` → grava tudo em `wa_campaigns` (usa colunas existentes + novo `variables_mapping jsonb`)

### Migration mínima

- `ALTER TABLE wa_campaigns ADD COLUMN variables_mapping jsonb`, `ADD COLUMN button_url_mapping jsonb`, `ADD COLUMN responsavel_id uuid`
- Novo helper SQL: `public.wa_render_variable(_template text, _contact jsonb, _mapping jsonb)` — puro, sem side effects (opcional; posso fazer só em TS)

## 6. Novas rotas leves (filtros de listagem)

Reusam a página `admin.whatsapp-campanhas.tsx` já existente com prop de filtro:
- `/admin/campanhas/agendadas` · `/em-andamento` · `/concluidas` · `/relatorios`
- `/admin/relatorios/geral` · `/por-cliente` · `/por-campanha` · `/por-numero` · `/por-template` · `/por-responsavel` — todos derivam do `wa-reports.functions.ts` com `groupBy` diferente
- `/admin/sistema/permissoes` · `/usuarios` · `/tokens` · `/logs` — reusam `user_roles`, `profiles`, `activity_logs`, `secrets`

Nada disso é módulo novo — só route file + `<CampanhasList filter={...} />`.

## 7. Preservado

- Todas as tabelas, RLS, tokens no backend, opt-in, opt-out, webhook `/api/public/whatsapp/webhook`, Embedded Signup da Fase 2, integrações da Meta.
- Nenhum arquivo apagado sem substituto na sidebar.

## Ordem de execução

1. Design tokens + fontes + utilitários
2. Componentes premium (StatCard, Stepper, StatusBadge, etc.)
3. Sidebar reagrupada + rotas leves de filtro
4. Dashboard novo
5. Refino visual nas telas existentes (cards, tabelas, headers)
6. Migration do wizard
7. Backend do wizard (`wa-wizard.functions.ts`)
8. Wizard 7 etapas (nova rota)
9. Typecheck + verificação visual via preview
