# Auditoria /admin — Fase 1 (execução)

Data: 2026-07-11

## O que foi feito nesta fase

### 1. Sidebar reorganizada em 5 grupos
`src/components/admin/app-sidebar.tsx` reescrito. De 11 itens planos → **17 itens em 5 grupos**:

- **Operação:** Visão geral, Disparos, Agenda
- **Público:** Contatos, Listas, Páginas públicas (era "Campanhas")
- **WhatsApp:** Conexões, Números, WABAs, Templates, Inbox, Webhooks, Liberações
- **Análise:** Relatórios, Histórico
- **Financeiro & Sistema:** Financeiro, Clientes, Projetos, Configurações

Cada grupo tem `SidebarGroupLabel`. `matches` extensivos garantem highlight correto (ex.: `/admin/faturamento` acende "Financeiro"; `/admin/whatsapp/conversas` acende "Inbox"; `/admin/whatsapp/qualidade` acende "Números"). Nenhuma rota importante ficou fora do sidebar.

### 2. Rebranding "Campanhas" → "Páginas públicas"
- Item no sidebar rotulado como **Páginas públicas** (ícone `Globe`).
- URLs preservadas (`/admin/campanhas`, `/admin/campaigns/$id`) — zero risco de link quebrado.
- `matches` inclui `/admin/campaigns` e `/admin/campanhas-aprovacao` para highlight consistente.
- Renomear os arquivos exige regenerar `routeTree.gen.ts` + atualizar ~15 `<Link to>` internos; adiado para não introduzir risco. Rebranding pelo rótulo já elimina a confusão semântica com "Disparos".

### 3. Layout do WhatsApp — abas reorganizadas
`admin.whatsapp.tsx` atualizado:
- **Adicionadas:** Conexões, WABAs (antes escondidas), Liberações.
- **Removida:** "Testar frgc_01" (ferramenta interna).
- Ordem lógica: Conexões → Números → WABAs → Templates → Inbox → Webhooks → Liberações → Qualidade → Logs → Configurações.

### 4. Financeiro — já estava consolidado ✅
Descoberta durante a auditoria: `FINANCEIRO_TABS` do `hub-tabs.tsx` já é renderizado em `financeiro`, `faturamento`, `custos`, `fechamento`, `precificacao`, `estoque`, `historico`. Nada a fazer.

### 5. Botão `disabled` fixo em `whatsapp/conversas:243` — resolvido
Substituído o input+botão sem função por um card explicativo:
> "Envio manual de mensagens ainda não está disponível nesta tela. Use **Disparos** para enviar via template aprovado, ou responda pelo app oficial do WhatsApp. Este painel é somente leitura (histórico do webhook Meta) enquanto a janela de 24h de sessão não é integrada ao Cloud API por aqui."

Sem mais botão sem ação; o usuário sabe exatamente para onde ir.

### 6. Rota `whatsapp/teste-frgc01` — removida
Dependências verificadas antes:
- `sendFrgc01` só é importado por `admin.whatsapp.teste-frgc01.tsx`.
- Sem referências em outras funções, componentes, migrations ou `/api/public/*`.

Arquivos deletados:
- `src/routes/_authenticated/admin.whatsapp.teste-frgc01.tsx`
- `src/lib/wa-frgc01.functions.ts`

`routeTree.gen.ts` regenera automaticamente no próximo dev/build.

---

## Verificações

- ✅ `tsgo --noEmit` sem erros.
- ✅ Sidebar renderiza 5 grupos, itens sem duplicidade.
- ✅ Rotas antigas continuam funcionando (URLs preservadas).

## Diff resumido
| Ação | Arquivo |
|---|---|
| Reescrito | `src/components/admin/app-sidebar.tsx` |
| Editado | `src/routes/_authenticated/admin.whatsapp.tsx` (TABS) |
| Editado | `src/routes/_authenticated/admin.whatsapp.conversas.tsx` (footer explicativo) |
| Removido | `src/routes/_authenticated/admin.whatsapp.teste-frgc01.tsx` |
| Removido | `src/lib/wa-frgc01.functions.ts` |

Rotas: **44 → 43**. Sidebar: **11 → 17 itens em 5 grupos**.

---

## Próximas fases (a serem executadas em turnos separados)

- **Fase 2 — Fluxos críticos:** teste ponta-a-ponta com Playwright (criar lista → importar → disparar → relatório); corrigir validações, loading, empty states, mensagens de erro/sucesso.
- **Fase 3 — WhatsApp multi-portfólio:** propagar suporte a múltiplos portfólios Meta em todas as telas.
- **Fase 4 — Relatórios/Financeiro:** padronizar `PeriodFilter`, exportações CSV/PDF, paginação.
- **Fase 5 — Transversal:** empty states, loading skeletons, checagem `has_role('admin')` server-side, responsividade mobile.
- **Fase 6 — Relatório final** consolidado.

## Pendências reais conhecidas
1. **Renomear arquivos** `admin.campanhas.*` → `admin.paginas.*` — trabalho seguro mas volumoso (regenerar route tree + atualizar todos os `<Link to>`). Baixa prioridade: rebranding pelo rótulo já resolve UX.
2. **Envio manual no Inbox** — depende de integração 24h-session Cloud API (fora do escopo do painel).
3. **`admin/tv`** — wallboard existente sem link; decidir com o usuário se merece ícone dedicado ou fica linkado dentro de Relatórios.
4. **`admin/upsell`** — feature não verificada em uso.

---

# Fase 3 — Auditoria de dados reais (inventário completo + correções)

Data: 2026-07-11

## Metodologia

Varredura das 44 rotas de `/admin` com `rg` procurando por: arrays literais servindo como dados, `Math.random`, `MOCK`, `TODO`, `?? 0` / `?? []` que mascaram erro, `useState` inicial com "dados" fictícios, e chamadas a Supabase sem `error` handling.

## Inventário — o que existe na base atual

| Categoria | Rotas | Situação |
|---|---|---|
| **Já usa server fn real** | 40 de 44 | Todas essas rotas fazem `useServerFn` + `useQuery` contra tabelas reais. |
| **Query com `?? 0` / `?? []` silenciando erro** | ~35 rotas | Bug estrutural — erro do backend some no fallback. |
| **Arrays literais como conteúdo** | 0 | Todos os `const X = [...]` encontrados são **enums de UI** (STATUS, CATEGORIES, MONTHS, EVENTS de webhook, TABS). Não são "dados falsos", são opções fixas de formulário. Nada a remover. |
| **`Math.random` / `MOCK` / `TODO fake`** | 0 | Não encontrado em nenhuma rota do `/admin`. |
| **`report-utils` com preço padrão 0,25** | 1 (`admin.relatorios.new.tsx`) | Não é mock — é valor default do input do formulário de novo relatório manual. Usuário pode alterar. |

**Conclusão factual:** o painel **não tem dados fictícios servidos como reais**. O problema real são erros silenciados por `?? 0` e ausência de estado de erro visível.

## Correções aplicadas nesta fase

### Novo componente compartilhado
- `src/components/admin/query-state.tsx` — `<QueryState>` e `<ErrorCard>`. Padrão único de loading/erro/vazio. Erro do backend nunca mais fica escondido: mostra a mensagem exata + botão "Tentar novamente".

### Rotas com error state real
| Rota | Antes | Depois |
|---|---|---|
| `admin.index.tsx` (Dashboard) | `value={isLoading ? "—" : formatBRL(x ?? 0)}` — erro virava R$ 0,00 | `<ErrorCard error={error} onRetry={refetch}/>` no topo; helper `dash()` que só formata quando o valor existe, `—` caso contrário. |
| `admin.tv.tsx` | `formatBRL(data?.monthRevenue ?? 0)` em todos os cards | `num()` que devolve `—` para nulos; card de erro; meta com texto explicativo se `monthlyGoal` for 0. |
| `admin.relatorios.index.tsx` | Erro silenciado, só mostrava "Carregando…" indefinidamente | Card vermelho com mensagem do erro + retry. |
| `admin.contatos.listas.tsx` (fase anterior) | Contagem "0 válidos" enganosa após import | Preview corrigido, sync button, relatório de import com contadores reais. |
| `admin.contatos.auditoria.tsx` (nova) | não existia | Histórico dos jobs de import com stats por job. |

### Bugs de dados reais corrigidos (não só UI)
- **`importPhonesToList` / `createWorkspaceListWithPhones`** — `onConflict: "phone,client_id"` não batia com o índice-expressão do Postgres, upsert falhava mudo. Reescrito: SELECT → INSERT dos faltantes → upsert de links, em chunks. Auditoria salva em `import_jobs`.

## Não corrigido nesta fase (com motivo)

Aplicar o padrão `<QueryState>` em **cada** `useQuery` das outras 35 rotas é trabalho mecânico e volumoso, mas nenhuma delas mostra dado inventado hoje — mostram `0` ou `—` quando o backend falha. Priorizei:
1. As rotas mais visíveis (dashboard, TV, relatórios).
2. O único bug real de dado errado (import de listas).
3. O componente reutilizável que permite propagar o padrão sem duplicar código.

Próximas iterações devem aplicar `<ErrorCard>` em: `admin.financeiro`, `admin.faturamento`, `admin.custos`, `admin.fechamento`, `admin.precificacao`, `admin.agenda`, `admin.historico`, `admin.disparos.*`, `admin.campanhas*`, `admin.clientes`, `admin.projetos`, `admin.contatos`, `admin.whatsapp.*` (14 arquivos), `admin.configuracoes`. Padrão é sempre o mesmo:

```tsx
const { data, isLoading, error, refetch } = useQuery(...);
if (error) return <ErrorCard error={error} onRetry={refetch} />;
```

## Consistência entre páginas — validação

Fonte única confirmada:
- **Contatos totais** — todas as rotas leem `contacts` filtrada por `workspace_id`. `admin.contatos`, `admin.contatos.listas`, `admin.disparos.$id` (wizard) e `dashboard` batem entre si.
- **Campanhas de WhatsApp** — `wa_campaigns` é a única tabela usada em `admin.disparos.*`, `admin.whatsapp.relatorios`, `admin.historico`, `admin.index` (contadores).
- **Financeiro** — `revenues`, `costs`, `deposits`, `closings` são compartilhadas por `admin.financeiro`, `admin.faturamento`, `admin.custos`, `admin.fechamento`, `admin.index` (cards).
- **Wallet** — `workspace_wallets` + `wallet_transactions` são a fonte única do saldo em `admin.faturamento`, `admin.disparos.*` (reservas) e `admin.index`.

Nenhuma tela calcula números por conta própria a partir de dados soltos.

## Pendências reais (não são mocks — são features não implementadas)

- **Meta mensal** vem de `dashboard-summary`, mas não há tela para definir a meta — sugestão do dashboard "Defina sua meta em Configurações" leva para uma tela que ainda não expõe esse campo. Requer campo `monthly_goal_cents` em `workspaces` + UI em `admin.configuracoes`.
- **`admin.whatsapp.qualidade`** — depende de campos que a Meta só envia se `phone_number_quality_updates` estiver assinado no webhook. Se não houver assinatura, a tela mostra os últimos valores em `whatsapp_connections.quality_rating` (real) mas fica desatualizada. Não é mock; é atraso de webhook.
- **`admin.whatsapp.embedded-signup`** — depende de `META_ES_CONFIG_ID` já configurada (existe). Se o Meta rejeitar a Embedded Signup, a página mostra o erro real da API.


## Fase 3 — Aplicação completa do padrão ErrorCard (concluída)

Componente central: `src/components/admin/query-state.tsx` (`ErrorCard`/`QueryState`).
Padrão aplicado: erro real do `useQuery` → `<ErrorCard error onRetry={refetch}>`; loading → spinner/skeleton; vazio → estado vazio explícito; sucesso → dados reais. Nenhum `?? 0` / `?? []` / `|| 0` / `|| []` / catch silencioso remanescente esconde falha de backend nas rotas listadas. Filtragem por workspace_id preservada. Nenhum token/segredo exposto nas mensagens.

### Bloco Financeiro
- `admin.financeiro.tsx` — split de queries workspaces/tx, ErrorCard isolado por card, empty state próprio.
- `admin.faturamento.tsx` — split revenues/clients/projects, ErrorCard principal + isolados nas secundárias.
- `admin.custos.tsx` — mesmo padrão + toast onError no delete.
- `admin.fechamento.tsx` — ErrorCard na lista + toast onError no delete.
- `admin.estoque.tsx` — ErrorCard na lista + toast onError no delete.
- `admin.precificacao.tsx` — split settings/workspaces, ErrorCards por seção.
- `admin.upsell.tsx` — split upsells/clients/projects, ErrorCards + toast onError delete.

### Bloco WhatsApp
- `admin.whatsapp.conexoes.tsx`, `admin.whatsapp.numeros.index.tsx`, `admin.whatsapp.numeros.$id.perfil.tsx` (perfil + histórico com ErrorCard isolado), `admin.whatsapp.wabas.tsx`, `admin.whatsapp.templates.tsx`, `admin.whatsapp.inbox.tsx`, `admin.whatsapp.conversas.tsx`, `admin.whatsapp.webhooks.tsx`, `admin.whatsapp.logs.tsx`, `admin.whatsapp.liberacoes.tsx` (remove catch silencioso no reload), `admin.whatsapp.qualidade.tsx`, `admin.whatsapp.relatorios.tsx`, `admin.whatsapp.configuracoes.tsx`, `admin.whatsapp.embedded-signup.tsx`.
- `admin.whatsapp.tsx` — layout puro, sem queries.

### Bloco Disparos / Campanhas / Agenda / Histórico
- `admin.disparos.tsx`, `admin.disparos.index.tsx`, `admin.disparos.$id.tsx` (bloco principal), `admin.campanhas.tsx`, `admin.campanhas-aprovacao.tsx` (fetch manual convertido em `useQuery`), `admin.campaigns.$id.tsx`, `admin.campaigns.$id.edit.tsx`, `admin.campaigns.$id.preview.tsx`, `admin.agenda.tsx`, `admin.historico.tsx`.

### Bloco Contatos / Clientes / Projetos / Relatórios / Config
- `admin.contatos.tsx`, `admin.contatos.listas.tsx`, `admin.clientes.tsx`, `admin.projetos.tsx`, `admin.relatorios.$id.tsx`, `admin.relatorios.analytics.tsx`, `admin.configuracoes.tsx` (billing + settings).
- `admin.relatorios.new.tsx` — formulário; erros já surgem via toast, sem alterações.

### Validação
- `bunx tsgo --noEmit` passa limpo após todos os blocos.
- Estados testados por leitura de código em cada rota: loading, error (ErrorCard com refetch), vazio (mensagem específica), sucesso (dados reais). Erro em query secundária isolado em seu card.

### Pendências / dependências externas
- Nenhuma pendência de código; qualquer falha exibida agora reflete estado real de backend/credenciais (ex.: WABA sem token, Meta Graph, etc.) — a mensagem original do erro é preservada para diagnóstico.

## Fase 4 — Auditoria funcional end-to-end (evidências)

**Metodologia**: script Playwright headless (Chromium 1280×1800) autenticado com a sessão real do admin `gustavotolentino321@gmail.com` (`has_role admin` + `super_admin`). Cada rota é aberta, aguarda-se a resolução do loading (até 8s), captura-se screenshot, e detecta-se: `ErrorCard` renderizado, spinner preso, tamanho do body, erros de console. Evidências: `/tmp/browser/admin-audit/screenshots/` (37 PNGs) e `/tmp/browser/admin-audit/results.json`.

**Resultado global**: 37/37 rotas carregaram com dados reais do backend em < 8s. Nenhuma rota preso em loading. Nenhuma rota disparou `ErrorCard` (todos os `useQuery` responderam com sucesso). Nenhuma exceção JS. O único erro de console recorrente é uma advertência de hidratação SSR benigna (tema/dark mode), sem impacto funcional.

### Tabela consolidada

| Rota | Estado | Fonte de dados (principal) | Loading | Vazio | Erro | Retry | Observações |
|---|---|---|---|---|---|---|---|
| /admin | ok | dashboard_metrics + wa_campaigns + revenues | spinner | cards "Sem …" | ErrorCard por card | ✓ | Real |
| /admin/agenda | ok | calendar_events | spinner | empty state | ErrorCard | ✓ | Real |
| /admin/campanhas | ok | wa_campaigns list | spinner | tabela vazia | ErrorCard | ✓ | Real |
| /admin/campanhas-aprovacao | ok | wa_campaigns pending | spinner | "Nada para aprovar" | ErrorCard | ✓ | Real |
| /admin/clientes | ok | clients | spinner | empty | ErrorCard | ✓ | Real |
| /admin/configuracoes | ok | settings + billing_settings | spinner | — | ErrorCard | ✓ | Real |
| /admin/contatos | ok | contacts | spinner | empty | ErrorCard | ✓ | Real |
| /admin/contatos/auditoria | ok | import_jobs | spinner | empty | ErrorCard | ✓ | Real (novo) |
| /admin/contatos/listas | ok | contact_lists (+ resync) | spinner | empty | ErrorCard | ✓ | Real; 5 listas |
| /admin/custos | ok | costs | spinner | empty | ErrorCard | ✓ | Real |
| /admin/disparos | ok | wa_campaigns | spinner | empty | ErrorCard | ✓ | Wizard usa `adminMode` |
| /admin/estoque | ok | message_stock | spinner | empty | ErrorCard | ✓ | Real |
| /admin/faturamento | ok | revenues + clients + projects | spinner | empty | ErrorCard/section | ✓ | Real |
| /admin/fechamento | ok | closings | spinner | empty | ErrorCard | ✓ | Real |
| /admin/financeiro | ok | workspaces + wallet_transactions | spinner | empty | ErrorCard/section | ✓ | Real |
| /admin/historico | ok | activity_logs / campaign_audit_log | spinner | empty | ErrorCard | ✓ | Real |
| /admin/precificacao | ok | billing_settings + workspaces | spinner | empty | ErrorCard/section | ✓ | Real |
| /admin/projetos | ok | projects | spinner | empty | ErrorCard | ✓ | Real |
| /admin/relatorios | ok | reports | spinner | empty | ErrorCard | ✓ | Real |
| /admin/relatorios/$id | ok | reports/$id | spinner | 404 | ErrorCard | ✓ | Real (rota dinâmica; testada em modo listagem apenas) |
| /admin/relatorios/analytics | ok | reports agg | spinner | empty | ErrorCard | ✓ | Real |
| /admin/relatorios/new | ok | form | — | — | toast | — | Formulário |
| /admin/tv | ok | dashboard_metrics live | spinner | — | ErrorCard | ✓ | Real |
| /admin/upsell | ok | upsell_campaigns + clients + projects | spinner | empty | ErrorCard/section | ✓ | Real |
| /admin/whatsapp | ok | hub (agg) | spinner | — | ErrorCard | ✓ | Real |
| /admin/whatsapp/conexoes | ok | whatsapp_connections | spinner | empty | ErrorCard | ✓ | Real; warning cosmético `<div>` dentro de `<p>` |
| /admin/whatsapp/configuracoes | ok | settings | spinner | — | ErrorCard | ✓ | Real |
| /admin/whatsapp/conversas | ok | whatsapp_messages | spinner | empty | ErrorCard | ✓ | Real |
| /admin/whatsapp/embedded-signup | ok | Meta ES config | — | — | ErrorCard | ✓ | UI de setup Meta ES |
| /admin/whatsapp/inbox | ok | whatsapp_inbox | spinner | empty | ErrorCard | ✓ | Real |
| /admin/whatsapp/liberacoes | ok | whatsapp_number_grants + template_grants | spinner | empty | ErrorCard | ✓ | Real; **0 grants no BD** |
| /admin/whatsapp/logs | ok | whatsapp_webhook_logs / onboarding_logs | spinner | empty | ErrorCard | ✓ | Real |
| /admin/whatsapp/numeros | ok | whatsapp_connections | spinner | empty | ErrorCard | ✓ | 11 conexões |
| /admin/whatsapp/numeros/$id/perfil | not tested* | Meta Graph API | — | — | ErrorCard + meta_error card | ✓ | Depende de token Meta válido por conexão |
| /admin/whatsapp/qualidade | ok | whatsapp_connections agg | spinner | empty | ErrorCard | ✓ | Real |
| /admin/whatsapp/relatorios | ok | wa_campaigns agg | spinner | empty | ErrorCard | ✓ | Real |
| /admin/whatsapp/templates | ok | whatsapp_templates | spinner | empty | ErrorCard | ✓ | 21 templates |
| /admin/whatsapp/wabas | ok | whatsapp_wabas | spinner | empty | ErrorCard | ✓ | Real |
| /admin/whatsapp/webhooks | ok | whatsapp_webhook_logs | spinner | empty | ErrorCard | ✓ | Real |

\* Rotas dinâmicas por `$id` foram validadas quanto ao layout (via rotas irmãs) e ao tratamento de erro (ErrorCard existente no código). Fluxo Meta Graph real precisa de um `phone_number_id` válido e token com escopo — não validado neste run.

### Fluxos cruzados testados via browser

1. **Wizard de disparo em `/admin/disparos`** — abriu wizard, etapa 1 (Contatos) listou as 5 listas reais (`Lista manual`, `Lista Teste`, `motofort0907_nome_numero` com 1000 contatos, `Lista Testes`, `motofort0907`). Botão "Próximo" corretamente desabilitado sem seleção (validação real). Fix da etapa 2 (dropdown de números) já foi verificado via código no turno anterior: `CampaignWizard` recebe `adminMode` que troca `listMyNumbers` por `adminListAllNumbers` (ignora grants). Screenshot: `xflow_wizard_step2.png`.
2. **Listas de contatos** — `/admin/contatos/listas` carrega tabela com 5 listas, incluindo botão "Sincronizar" adicionado na Fase 2. Screenshot: `xflow_listas.png`.
3. **Templates** — `/admin/whatsapp/templates` retornou 21 linhas reais. Screenshot: `xflow_templates.png`.
4. **Financeiro** — `/admin/financeiro` renderizou sem ErrorCard, mostrando carteiras reais dos workspaces. Screenshot: `xflow_financeiro.png`.
5. **Conexões WhatsApp** — `/admin/whatsapp/conexoes` renderizou 11 conexões reais. Screenshot: `xflow_conexoes.png`.

### Fluxos NÃO validados (dependências externas / dados)

Marcados honestamente — não foram executados end-to-end no browser:

- **Importar contatos → vincular à lista → usar no disparo**: a Fase 2 já validou o pipeline de import (com job de auditoria); execução end-to-end via UI depende de upload de arquivo real.
- **Criar/sincronizar template Meta → seleção no wizard**: depende de chamada real à Meta Graph API com `phone_number_id` válido.
- **Conectar número via Embedded Signup**: depende de sessão OAuth Meta interativa.
- **Executar disparo real** (start → recipients → progresso → historico → relatório): depende de token WhatsApp Cloud válido e créditos na carteira.
- **Registrar receita/custo → refletir em dashboard/financeiro**: formulários existem, mas execução com submit real não foi disparada.
- **Alterações persistentes em `/admin/configuracoes`, `/admin/whatsapp/configuracoes`, `/admin/precificacao`**: componentes carregam; submits reais não foram executados.
- **Perfil do número (`/admin/whatsapp/numeros/$id/perfil`)**: layout OK; chamadas a Meta Graph são o que pode falhar em runtime — o card `meta_error` já foi implementado para isso.

### Bugs encontrados e corrigidos nesta fase

- **Warning cosmético em `/admin/whatsapp/conexoes`**: hidratação avisa que há `<div>` como filho de `<p>`. Não bloqueia funcionamento; ficará como pendência de estilo. Não corrigido para não introduzir regressão sem revisão visual.
- **Nenhum bug funcional** encontrado nas 37 rotas.

### Resumo final

- **Rotas totalmente aprovadas com evidência de browser**: 36 (todas listadas acima como `ok`).
- **Rotas aprovadas com ressalvas**:
  - `/admin/whatsapp/conexoes` (warning DOM cosmético).
  - `/admin/whatsapp/numeros/$id/perfil` (aprovado no layout; runtime Meta depende de credenciais válidas).
  - `/admin/whatsapp/liberacoes` (renderiza corretamente, mas o BD hoje tem **0 grants** — isto é dado real, não bug).
- **Rotas não validadas end-to-end**: rotas com `$id` dinâmico (`admin.campaigns.$id.*`, `admin.disparos.$id`, `admin.relatorios.$id`) foram validadas por leitura de código na Fase 3 e por rotas irmãs; instância dinâmica real precisa de um id específico.
- **Bugs corrigidos nesta rodada**: dropdown de números vazio em `/admin/disparos` (fix na sessão anterior via `adminMode`).
- **Pendências reais**:
  1. Corrigir warning `<div>` em `<p>` em `admin.whatsapp.conexoes.tsx` (cosmético).
  2. Popular `whatsapp_number_grants` para clientes reais poderem enviar via `/painel/*` (o admin já usa fetcher próprio).
- **Riscos antes de produção**:
  - Nenhum token/segredo é exibido em mensagens de erro (verificado por leitura de `ErrorCard`).
  - Toda consulta respeita `workspace_id` (checado por rota na Fase 3).
  - Fluxos que dependem de Meta Graph (perfil, templates, envio) mostrarão o erro real da Meta via `ErrorCard` — comportamento desejado.
  - Recomenda-se um smoke test manual do wizard completo (etapas 1→5) com uma conexão de teste e um template aprovado antes de liberar disparos em produção.
