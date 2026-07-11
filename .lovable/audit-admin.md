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
