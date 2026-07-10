# Refazer /admin/disparos como wizard único de 5 etapas

## 1. Rotas — consolidação e limpeza

**Remover / redirecionar**
- Deletar `src/routes/_authenticated/admin.disparos.novo.tsx` (7 etapas antigo)
- Manter `admin.disparos.tsx` (layout) e `admin.disparos.$id.tsx` (relatório detalhado por campanha existente)

**Rota única de trabalho**
- `admin.disparos.index.tsx` passa a ser o wizard em página única, com **dois modos** dentro da mesma URL controlados por state:
  - **Modo lista** (default quando existem campanhas ativas/rascunhos): mostra tabela de disparos + botão grande "Criar novo disparo" que entra no modo wizard sem sair da rota.
  - **Modo wizard**: 5 etapas com stepper fixo no topo.
- Quando a campanha for concluída, o modo Resultados dessa campanha é acessível também via `/admin/disparos/$id` (rota já existente) — sem duplicar tela.

## 2. Sidebar

Reorganizar `src/components/admin/app-sidebar.tsx` na ordem pedida:

```
Visão geral → /admin
Disparos    → /admin/disparos
Campanhas   → /admin/campanhas (cloaker existente)
Contatos    → /admin/contatos
Listas      → /admin/contatos/listas
Templates   → /admin/whatsapp/templates
Números     → /admin/whatsapp/numeros
WABAs       → /admin/whatsapp/wabas
Relatórios  → /admin/relatorios
Webhooks    → /admin/whatsapp/webhooks
Configurações → /admin/configuracoes
```

Sem item "Novo disparo".

## 3. Wizard — arquitetura

Página única com `useState<Step>()`, sem navegação de rota entre etapas. Estado da campanha em rascunho persistente:
- Persistência local em `localStorage` (recuperação após reload).
- Persistência backend em `wa_campaigns` com `status='draft'` gravado a cada mudança relevante (debounce). Isso já é suportado pelo schema (67 colunas) — o rascunho volta se o navegador for fechado.

Stepper horizontal fixo (reaproveita `src/components/campaigns/wizard/Stepper.tsx` já criado com ícones), botões "Voltar/Próximo" fixos no rodapé (padrão já aplicado).

## 4. Etapa 1 — Contatos (3 colunas)

Reaproveita `ContactsStep.tsx` já criado no painel, adaptado para admin (mostra contatos de todos os workspaces via server fn admin).

**Coluna esquerda — Fontes**
- Abas **Filtros** / **Agrupamentos**
- Fontes: Contatos salvos · Listas salvas · Caixa de entrada · Etiquetas · Grupos · Importar planilha (CSV/XLSX)
- Filtros extras: Data de cadastro, DDD, Cidade, Estado, Status
- Busca por nome ou telefone

**Importação CSV/XLSX** (novo componente `ImportContactsDialog`)
- Upload local (xlsx via biblioteca `xlsx`, csv nativo)
- Prévia das 5 primeiras linhas em tabela
- Mapeamento de colunas (Nome, Telefone, Email, CPF, Cidade, campos custom)
- Padronização de telefone (`libphonenumber-js` — já poss. de instalar) com DDI automático
- Detecção de duplicados e inválidos
- Resumo antes de importar
- Opção "Salvar como nova lista" → cria em `contact_lists` + `contact_list_items`

**Coluna central — Contatos disponíveis**
- Barra de pesquisa, contador "X disponíveis • Y selecionados"
- Botão "Selecionar tudo"
- Lista virtualizada (`@tanstack/react-virtual`) para não travar com 24k+ contatos
- Cada linha: checkbox, avatar, nome, telefone, tipo (Contato/Grupo/Etiqueta)

**Coluna direita — Selecionados**
- Total + lista removível
- Botões: Limpar seleção, Adicionar contato manual, Criar agrupamento (salva a seleção como nova `contact_list`)

Botão "Próximo" desabilitado até haver ≥ 1 destinatário válido.

## 5. Etapa 2 — Ações (2 áreas)

**Principal**
- **Número WhatsApp**: cards com nome, número, status, qualidade, limite tier, WABA, nome de exibição, última sync. Só habilita ativos/conectados.
- **Template**: carrega templates aprovados da WABA do número escolhido. Mostra categoria, idioma, cabeçalho, corpo, rodapé, botões, mídia.
- **Variáveis**: um input por variável do template. Suporta sintaxe `{nome|"Cliente"}` (fallback) — já existe em `wa-variables.ts`. Bloqueia avançar se sobrar `{{n}}` ou `undefined`.
- **Configurações**: intervalo, tamanho de lote, pausa entre lotes, duração da pausa, max tentativas, auto-pausa em erro, horário início, agendamento, timezone, nome interno.
- **Estimativa em tempo real**: destinatários × intervalo → tempo previsto + data prevista de conclusão.

**Lateral — Prévia WhatsApp**
- Reaproveita `WhatsAppPreview.tsx`. Renderiza header (com mídia real via signed URL do bucket `campaign-images`), corpo com variáveis substituídas usando o 1º contato selecionado, footer, botões.
- Atualiza a cada alteração (React state, sem debounce forte para não parecer travado).

## 6. Etapa 3 — Revisão

Cards editáveis (botão "Editar" pula para a etapa correspondente sem perder estado):
- **Destinatários**: total, lista/agrupamento, inválidos, duplicados removidos, opt-outs removidos, amostra
- **Número**: nome, número, status, qualidade, limite
- **Template**: nome, idioma, categoria, variáveis, mídia, prévia completa
- **Configurações**: intervalo, lote, pausas, agendamento, estimativa

**Validações finais** (bloqueiam o disparo, mostram inline com mensagem específica):
- Conexão ativa e com token
- Template aprovado
- Mídia disponível (se header for image/video/doc)
- Todas variáveis preenchidas
- Contatos válidos > 0
- Saldo suficiente (se `charged_cents` for aplicável)
- Agendamento futuro válido

Botão **"Realizar disparo"** → confirmação modal com resumo antes de enfileirar.

## 7. Etapa 4 — Envio (tempo real)

- Cria campanha via `createCampaignFromWizard` + `buildRecipients` + `startWaCampaign` (já existem)
- Progresso via **Realtime** de `campaign_recipients` (ADD TABLE ao publication) e polling de `wa_campaigns.progress` como fallback (função `wa_recalc_campaign_progress` já existe)
- KPIs: total, processados, enviados, entregues, lidos, falhas, pendentes, pausados, velocidade, ETA, próxima pausa, lote atual
- Lateral: fila de contatos com status colorido (virtualizada)
- Controles: Pausar / Retomar / Cancelar / Forçar cancelamento (server fns `pauseWaCampaign`, `resumeWaCampaign` — falta criar `forceCancel` que mata jobs pendentes)
- Falhas isoladas por contato (comportamento atual do `queue-tick` já é assim); reprocessamento com backoff configurável
- Usuário pode fechar o navegador — envio continua no worker (`queue-tick` cron)

## 8. Etapa 5 — Resultados

- KPIs finais + taxas de entrega/leitura
- Duração total, início, conclusão
- Filtros por status
- Ações: Exportar CSV, Exportar XLSX, Reenviar falhas, Duplicar campanha, Ver logs
- Link para relatório completo `/admin/disparos/$id` (já existe)

## 9. Backend — o que já existe vs o que falta

**Já existe (reaproveitar)**
- `wa_campaigns`, `campaign_recipients`, `contact_lists`, `contacts`, `whatsapp_templates`, `whatsapp_connections`
- Server fns: `listWaCampaigns`, `startWaCampaign`, `pauseWaCampaign`, `cancelWaCampaign`, `createCampaignFromWizard`, `buildRecipients`, `previewAudience`, `renderPreview`, `availableStock`, `scheduleWaCampaign`
- Worker de envio via `queue-tick`
- Funções DB: `wa_recalc_campaign_progress`, `wa_check_scheduling_conflict`

**Falta criar (via server fns novas)**
- `importContactsFromSheet` — recebe rows já parseados no client, cria/atualiza `contacts`, opcional `contact_lists` + `contact_list_items`
- `resumeWaCampaign` — retomar de paused
- `forceCancelWaCampaign` — cancelar sem esperar drain
- `duplicateWaCampaign` — clonar config em rascunho
- `resendFailedRecipients` — enfileirar apenas failed novamente
- `exportCampaignResults` — CSV/XLSX

**Migração** — apenas 1: `ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients, public.wa_campaigns` para o realtime da etapa Envio.

## 10. Ordem de execução

1. Sidebar reorganizada
2. Migração realtime + server fns novas (import, resume, force-cancel, duplicate, resend, export)
3. Componentes reutilizáveis novos (`ImportContactsDialog`, `LiveSendPanel`, `ResultsPanel`)
4. Reescrita de `admin.disparos.index.tsx` com wizard interno (modo lista + modo wizard)
5. Deletar `admin.disparos.novo.tsx`
6. Verificação: typecheck + Playwright rodando o fluxo ponta a ponta

## Notas técnicas

- **Virtualização de listas grandes**: `@tanstack/react-virtual` (adicionar dependência)
- **Parse XLSX no client**: `xlsx` (SheetJS, ~600kb; carregar via `lazy` só quando abrir importação)
- **Normalização de telefones**: `libphonenumber-js` (já leve ~140kb)
- **Persistência de rascunho**: chave `admin-disparos-draft` no localStorage + gravação em `wa_campaigns` com status `draft` a cada mudança de etapa
- **Realtime**: assinar `campaign_recipients` filtrado por `campaign_id`; cleanup no unmount
- **Sem `/admin/disparos/novo`**: qualquer link antigo redireciona para `/admin/disparos`

## Fora do escopo desta rodada

- Redesenhar `/admin/disparos/$id` (relatório detalhado) — mantém como está, só recebe links de "Ver detalhes"
- Refatorar outras áreas do /admin (contatos, listas, templates) — apenas garanto que a sidebar aponte corretamente
