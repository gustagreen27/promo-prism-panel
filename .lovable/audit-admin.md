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
