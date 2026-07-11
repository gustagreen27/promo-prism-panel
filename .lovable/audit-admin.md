# Auditoria /admin — Fase 0 (diagnóstico)

Data: 2026-07-11
Rotas escaneadas: 44 arquivos sob `src/routes/_authenticated/admin.*.tsx`

Legenda de recomendação: **MANTER · MESCLAR · MOVER · REMOVER · RENOMEAR**

---

## 1. Sidebar atual (11 itens)
`Visão geral · Disparos · Campanhas · Contatos · Listas · Templates · Números · WABAs · Relatórios · Webhooks · Configurações`

**Problemas:**
- **20+ rotas não estão no sidebar** (Agenda, Clientes, Projetos, Custos, Faturamento, Fechamento, Financeiro, Histórico, Precificação, Estoque, Upsell, TV, e 8 subrotas de WhatsApp). Usuário só chega via URL direta ou links internos → recurso "escondido".
- `Contatos` e `Listas` são itens separados no sidebar mas o conteúdo hoje é quase idêntico (já sinalizado em turno anterior).
- `Relatórios` usa `matches` para se ativar em `/financeiro` e `/agenda` — mistura semântica errada, faz o item "Relatórios" acender ao abrir Agenda.

---

## 2. Rota-a-rota

### Home / Dashboard
| Rota | LOC | Sidebar | Status | Recomendação |
|---|---|---|---|---|
| `admin/` (index) | 290 | ✅ Visão geral | OK | **MANTER** |
| `admin/tv` | ~? | ❌ | Tela de "TV wallboard" — não linkada | **MANTER + adicionar link em Relatórios** ou **REMOVER se não usado** — pedir ao usuário |

### Disparos (envio de mensagens)
| Rota | LOC | Sidebar | Recomendação |
|---|---|---|---|
| `admin/disparos` (layout) | – | – | **MANTER** (layout `<Outlet/>`) |
| `admin/disparos` (index) | 294 | ✅ | **MANTER** — lista de disparos |
| `admin/disparos/$id` | 604 | – | **MANTER** — detalhe |

### Campanhas (páginas públicas / cloaker) — CONFUSÃO GRAVE
Há **dois conceitos diferentes** compartilhando o nome "campanha":
- `admin/disparos/*` = campanhas de WhatsApp (`wa_campaigns`)
- `admin/campanhas` + `admin/campaigns/*` = páginas/cloaker (`campaigns`)

| Rota | LOC | Recomendação |
|---|---|---|
| `admin/campanhas` | 428 | **RENOMEAR → `admin/paginas`** (é gestão de páginas públicas) |
| `admin/campanhas-aprovacao` | ? | **MESCLAR** como aba dentro de `admin/paginas` |
| `admin/campaigns/$id` | 291 | **MOVER → `admin/paginas/$id`** |
| `admin/campaigns/$id/edit` | 701 | **MOVER → `admin/paginas/$id/edit`** |
| `admin/campaigns/$id/preview` | 192 | **MOVER → `admin/paginas/$id/preview`** |

> **Ação Fase 1:** rebatizar sidebar → `Páginas públicas` + `Disparos`. Elimina a colisão semântica.

### Contatos
| Rota | LOC | Recomendação |
|---|---|---|
| `admin/contatos` | 204 | **MANTER** — CRUD de contatos |
| `admin/contatos/listas` | 345 | **MANTER** — CRUD de listas |
| `admin/clientes` | ? | **MOVER para grupo "Cadastros"** ou submenu Contatos |
| `admin/projetos` | ? | idem |

### WhatsApp (15 subrotas!)
| Rota | Sidebar? | Recomendação |
|---|---|---|
| `admin/whatsapp` (layout) | – | **MANTER** |
| `admin/whatsapp/conexoes` | ❌ | **ADICIONAR ao sidebar** |
| `admin/whatsapp/wabas` | ✅ WABAs | **MANTER** |
| `admin/whatsapp/numeros` | ✅ Números | **MANTER** |
| `admin/whatsapp/numeros/$id/perfil` | – | **MANTER** — detalhe |
| `admin/whatsapp/templates` | ✅ Templates | **MANTER** |
| `admin/whatsapp/webhooks` | ✅ Webhooks | **MANTER** |
| `admin/whatsapp/inbox` | ❌ | **ADICIONAR ao sidebar** |
| `admin/whatsapp/conversas` | ❌ (matches numeros) | **MESCLAR com inbox** (redundante) — `disabled` fixo em L243 sinaliza recurso incompleto |
| `admin/whatsapp/configuracoes` | ❌ | **MESCLAR em `admin/configuracoes`** como aba "WhatsApp" |
| `admin/whatsapp/qualidade` | ❌ | **MESCLAR** em `admin/whatsapp/numeros` (é métrica por número) |
| `admin/whatsapp/relatorios` | ❌ | **MESCLAR** em `admin/relatorios` como aba |
| `admin/whatsapp/logs` | ❌ | **MESCLAR** em `admin/historico` como aba |
| `admin/whatsapp/liberacoes` | ❌ | **MANTER + linkar** — aprovações de números/templates |
| `admin/whatsapp/embedded-signup` | ❌ | **MOVER** para dentro de `conexoes` como ação "Conectar via Meta" |
| `admin/whatsapp/teste-frgc01` | ❌ | **REMOVER** — nome sugere ferramenta de teste interna |

### Relatórios
| Rota | LOC | Recomendação |
|---|---|---|
| `admin/relatorios` (index) | ? | **MANTER** |
| `admin/relatorios/new` | 194 | **MANTER** |
| `admin/relatorios/$id` | 310 | **MANTER** |
| `admin/relatorios/analytics` | 334 | **MESCLAR** como aba em `admin/relatorios` — hoje divide a mesma info |

### Financeiro (5 rotas espalhadas)
| Rota | LOC | Recomendação |
|---|---|---|
| `admin/financeiro` | 236 | **MANTER como layout com abas** |
| `admin/faturamento` | 276 | **MOVER → aba de Financeiro** |
| `admin/custos` | 194 | **MOVER → aba de Financeiro** |
| `admin/fechamento` | ? | **MOVER → aba de Financeiro** |
| `admin/precificacao` | 223 | **MOVER → aba de Financeiro** |

### Outras
| Rota | Recomendação |
|---|---|
| `admin/agenda` | **ADICIONAR ao sidebar** (grupo Operação) |
| `admin/historico` | **ADICIONAR ao sidebar** (grupo Análise) |
| `admin/estoque` | **AVALIAR** — estoque de mensagens? Confirmar com usuário se ainda faz sentido dado o wallet |
| `admin/upsell` | **AVALIAR** — feature em uso? |
| `admin/configuracoes` | **MANTER** |

---

## 3. Sinais automáticos detectados
- **TODO/FIXME:** 0 ocorrências ✅
- **onClick vazio:** 0 ocorrências ✅
- **`disabled` fixo:** 1 (`admin.whatsapp.conversas.tsx:243`) — botão sem ação
- **Rotas com `loader:`** 0 — nenhuma rota `/admin` usa loader (tudo client-side via `useQuery`). Portanto **nenhuma precisa de `errorComponent`/`notFoundComponent`**, mas ganharia com skeleton + retry padronizado.

---

## 4. Rotas duplicadas prontas para MESCLAR/REMOVER (proposta consolidada)

| Ação | Rotas envolvidas | Destino |
|---|---|---|
| RENOMEAR | `campanhas*` + `campaigns/*` | `admin/paginas/*` |
| MESCLAR | `campanhas-aprovacao` | aba de `admin/paginas` |
| MESCLAR | `relatorios/analytics` | aba de `admin/relatorios` |
| MESCLAR | `whatsapp/conversas` | dentro de `whatsapp/inbox` |
| MESCLAR | `whatsapp/configuracoes` | aba em `admin/configuracoes` |
| MESCLAR | `whatsapp/qualidade` | dentro de `whatsapp/numeros` |
| MESCLAR | `whatsapp/relatorios` | aba em `admin/relatorios` |
| MESCLAR | `whatsapp/logs` | aba em `admin/historico` |
| MESCLAR | `whatsapp/embedded-signup` | ação dentro de `whatsapp/conexoes` |
| MOVER | `faturamento`, `custos`, `fechamento`, `precificacao` | abas de `admin/financeiro` |
| REMOVER | `whatsapp/teste-frgc01` | (ferramenta interna de teste) |

Total: **-11 rotas** (44 → 33), sidebar cresce de 11 → ~14 itens organizados em 5 grupos.

---

## 5. Sidebar proposta (Fase 1)

```
OPERAÇÃO
  Visão geral            /admin
  Disparos               /admin/disparos
  Agenda                 /admin/agenda

PÚBLICO
  Contatos               /admin/contatos
  Listas                 /admin/contatos/listas
  Páginas públicas       /admin/paginas

WHATSAPP
  Conexões               /admin/whatsapp/conexoes
  Números                /admin/whatsapp/numeros
  WABAs                  /admin/whatsapp/wabas
  Templates              /admin/whatsapp/templates
  Inbox                  /admin/whatsapp/inbox
  Webhooks               /admin/whatsapp/webhooks
  Liberações             /admin/whatsapp/liberacoes

ANÁLISE
  Relatórios             /admin/relatorios
  Histórico              /admin/historico

FINANCEIRO
  Financeiro             /admin/financeiro (com abas)

SISTEMA
  Clientes               /admin/clientes
  Projetos               /admin/projetos
  Configurações          /admin/configuracoes
```

---

## 6. Perguntas para o usuário antes da Fase 1
1. `admin/tv` — manter (wallboard) ou remover?
2. `admin/estoque` — ainda faz sentido com o wallet ativo, ou substituir?
3. `admin/upsell` — feature em uso?
4. `admin/whatsapp/teste-frgc01` — pode remover?
5. OK renomear tudo de "campanhas/campaigns" (páginas cloaker) para "**Páginas públicas**" para eliminar a colisão com "Disparos = campanhas WhatsApp"? Redirects 301 client-side ficam ativos.

---

## 7. Pendências conhecidas (fora do escopo de Fase 0)
- Fluxo criar-lista → importar → disparar → relatório ainda **não testado ponta-a-ponta** (Fase 2)
- Suporte a múltiplos portfólios Meta por workspace — migração aplicada, UI ainda não reflete em todas as telas (Fase 3)
- Padronização de PeriodFilter, exportações CSV/PDF, paginação (Fase 4)
- Empty states e loading skeletons padronizados (Fase 5)
