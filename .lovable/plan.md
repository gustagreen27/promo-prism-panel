# Auditoria e revisão completa do /admin

## Contexto
O painel `/admin` cresceu muito rápido e hoje tem ~40 rotas, várias com sobreposição (contatos vs listas, disparos vs campanhas, relatórios vs analytics, whatsapp/* com 12 subrotas). Uma revisão "tudo de uma vez" em uma única resposta iria:
- gerar edições enormes sem revisão do usuário,
- arriscar quebrar fluxos que hoje funcionam (disparos, wallet, webhooks),
- consumir muitos créditos sem entregar valor claro por etapa.

A proposta abaixo divide o trabalho em **6 fases entregáveis**, cada uma como um turno separado, com auditoria + correções focadas. Você aprova fase por fase.

---

## Fase 0 — Mapa e auditoria (sem código)
Entrego um **relatório em `.lovable/audit-admin.md`** com, para cada rota de `/admin`:
- Propósito atual
- Está no sidebar? Onde?
- Duplicações / sobreposições detectadas
- Botões/campos sem ação (varredura por `onClick` vazio, `TODO`, `disabled` fixo)
- Chamadas de API que não existem mais ou retornam erro
- Recomendação: **manter / mesclar / mover / remover**

Sem alterações de código nesta fase — só diagnóstico pra você validar o que consolidar.

---

## Fase 1 — Reorganização de navegação e remoção de duplicatas
- Consolidar sidebar (`src/components/admin/app-sidebar.tsx`) em grupos claros:
  - **Operação:** Dashboard, Disparos, Campanhas, Agenda
  - **Público:** Contatos, Listas, Opt-outs
  - **WhatsApp:** Conexões, Números, WABAs, Templates, Webhooks, Inbox
  - **Financeiro:** Faturamento, Custos, Fechamento, Precificação
  - **Análise:** Relatórios, Histórico, Logs
  - **Configurações:** Configurações, Perfil, Clientes/Projetos
- Mesclar rotas duplicadas (ex.: `contatos` vs `contatos/listas` — já iniciado; `relatorios/analytics` vs `relatorios`; `campanhas` vs `disparos`).
- Redirects 301 client-side de rotas removidas → rotas canônicas.

## Fase 2 — Fluxos críticos (Disparos + Contatos + Templates)
Testar ponta-a-ponta com Playwright:
- Criar lista → importar contatos → criar disparo → agendar → executar → ver relatório.
- Corrigir botões quebrados, validações de formulário, estados de loading, mensagens de erro/sucesso, confirmações destrutivas.

## Fase 3 — WhatsApp (Conexões, WABAs, Números, Templates, Webhooks)
- Verificar que o suporte a **múltiplos portfólios por workspace** (migration já aplicada) está refletido em todas as telas.
- Corrigir sync com Meta, exibição de status de qualidade, aprovação de templates.

## Fase 4 — Relatórios, Financeiro, Logs
- Padronizar filtros de período (`PeriodFilter`), exportações CSV/PDF, paginação.
- Wallet: revisar reserva/consumo/liberação nas telas de faturamento.

## Fase 5 — Transversal (loading, erros, responsividade, permissões)
- `errorComponent` + `notFoundComponent` em toda rota de `/admin` com loader.
- Empty states padronizados (`EmptyState` já existe).
- Checagem de `has_role('admin')` server-side em todas as server fns sensíveis.
- Ajustes de responsividade mobile (sidebar colapsável já existe).

## Fase 6 — Relatório final de auditoria
Documento consolidado em `.lovable/audit-admin-final.md` com tudo que foi corrigido, movido, removido, testado, e pendências conhecidas.

---

## Detalhes técnicos
- Cada fase = 1 turno = 1 conjunto coeso de edições + verificação (build + Playwright quando aplicável).
- Migrations só se necessário (não prevejo nenhuma nas fases 1-5).
- Sem mudanças em `auth`, `wallet_*` functions, ou webhooks a menos que a auditoria da Fase 0 encontre bug.

## Por que dividir assim
Uma "revisão geral" feita num único turno vira patch de milhares de linhas sem como você validar. Fase 0 sozinha já responde "o que está quebrado e duplicado" — dali você decide o escopo real.
