
# Auditoria do /admin — o que está causando lentidão

Cruzei os `pg_stat_statements` do banco com o código do painel. Os problemas se dividem em **4 categorias**, listadas por impacto real (tempo total consumido no banco):

## 1) Consultas de destinatários com JOIN em `contacts` estão dominando o banco

Top ofensores (dados reais):

| # calls | avg | total | Consulta |
|---|---|---|---|
| 4.595 | 903 ms | **~69 min** | Lista recipients + `contact.name` (LEFT JOIN LATERAL contacts) paginada por `created_at ASC` |
| 2.688 | 677 ms | **~30 min** | Idem, versão com `failed_reason` |
| 1.496 | 475 ms | ~12 min | Idem, versão com `contact.email/metadata` |
| 2.659 | 1.516 ms | **~67 min** | `count(*)` de recipients filtrados por status (usado no HEAD/count PostgREST) |
| 1.463 | 1.647 ms | **~40 min** | `contact_list_items` + LEFT JOIN LATERAL contacts (tela de lista) |
| 2.357 | 197 ms | ~7 min | `count(*)` de `contact_list_items` por lista |

Causas:
- **Enriquecimento com `contacts.name`** é feito via embed do PostgREST (`.select("*, contact:contacts(name)")`). Isso vira LEFT JOIN LATERAL um contato por linha — barato em 100 linhas, catastrófico em qualquer página que peça `count=exact`.
- **`count=exact`** faz uma segunda varredura completa do predicado. É o motivo principal dos timeouts de 7s+.
- **Ordenação por `created_at ASC`** usa índice existente, mas o problema não é o índice — é o volume de linhas trazidas + JOIN.

## 2) Worker de disparo bate em UPDATE 1-a-1 sob concorrência
- `UPDATE campaign_recipients SET status/sent_at WHERE id=$1` — **27.587 chamadas**, 458s totais.
- `UPDATE ... WHERE id=ANY($1)` — 1.210 calls, 234s. Existe batch mas é minoria.
- Enquanto 1M linhas passam por UPDATE individual, qualquer SELECT no /admin sobre a mesma tabela compete por buffer/CPU → timeouts.

## 3) Painel /admin carrega tudo, sem paginação server-side
- `/admin/campanhas`: `useQuery(["campaigns"], () => list())` traz **todas** as campanhas e filtra no cliente (`filtered = data.filter(...)`).
- `/admin/disparos`: mesmo padrão — lista completa; filtros client-side.
- Detalhe da campanha: já reduzimos para 100 amostras, mas ainda faz `count=exact` implícito em várias telas.
- Ausência de `staleTime` → cada navegação re-executa consultas pesadas.

## 4) Polling agressivo durante disparos
- Página pública já em 15s, mas `/admin/campaigns/:id`, `/admin/disparos/:id` e listas usam `refetchInterval` curto (3–5s).
- Enquanto o worker martela 1M UPDATEs, cada refetch no painel pega o mesmo LOCK/CPU.
- `onAuthStateChange` + `invalidateQueries` também revalida tudo em SIGNED_IN/TOKEN_REFRESHED.

## Índices — status atual
Já existem os índices certos para a maioria dos casos (`campaign_recipients (campaign_id, created_at)`, `(campaign_id, status)`, `(campaign_id, sent_at DESC NULLS LAST) INCLUDE(...)`). **O gargalo não é falta de índice** — é o padrão de consulta + volume + JOIN + `count=exact`.

---

# Plano priorizado (7 frentes)

Vou executar do maior impacto → menor. Cada frente é entregável independente; posso pausar entre elas para você validar.

## Frente 1 — Desnormalizar `contacts.name` em `campaign_recipients` (elimina 80% do custo)
- Adicionar coluna `contact_name text` em `campaign_recipients` (já preenchido no build via `jsonb_build_object('nome', name)`).
- Backfill: `UPDATE ... SET contact_name = c.name FROM contacts c WHERE c.id = contact_id`.
- Atualizar `wa_build_recipients` para gravar `contact_name` direto.
- Refatorar todas as `.select("*, contact:contacts(name)")` para ler `contact_name` da própria linha → **elimina o LEFT JOIN LATERAL em todas as consultas top**.

## Frente 2 — Trocar `count=exact` por contagens denormalizadas
- Já temos `wa_campaigns.progress` (jsonb com totais por status) mantido pelo trigger `trg_wa_recipient_touch` / `wa_recalc_campaign_progress`.
- Todas as telas admin que hoje pedem `.select(..., { count: 'exact' })` para exibir "X/Y" passam a ler de `wa_campaigns.progress` / `total_recipients` / `sent_count` etc.
- `count=exact` só nas telas onde o filtro é dinâmico (busca por telefone/status arbitrário), e mesmo assim com `count=estimated` (PostgREST head_estimate) como default.

## Frente 3 — Paginação e filtros server-side no painel
- `/admin/campanhas` e `/admin/disparos`: paginar via URL search params (`page`, `pageSize`, `status`, `q`, `client`, `project`).
- Server function `listCampaigns` recebe `{ page, pageSize, filters }` → `.range(from, to)` sem count exact.
- Substituir o `.filter()` client-side por filtros passados ao servidor.
- Tabela virtualizada (react-virtual) se o `pageSize` puder passar de 100.

## Frente 4 — Reduzir polling + realtime seletivo
- Todos os `refetchInterval` de tela admin: 5s → 20s (10s quando aba visível).
- Trocar polling do detalhe da campanha por Realtime **apenas** no row de `wa_campaigns` (uma linha, barato) e por evento de `campaign_recipients` filtrado por `campaign_id` **desativado por padrão**, ligado só quando a página está visível e a campanha `running`.
- No `__root.tsx`, filtrar `onAuthStateChange` já foi feito na doc — auditar se está do jeito certo.

## Frente 5 — Worker: batch de UPDATEs e menos round-trips
- Trocar todos os UPDATE 1-a-1 do runner (`status`, `sent_at`, `delivered_at`, `read_at`, `failed_*`) por:
  - RPC `wa_apply_recipient_events(events jsonb)` que aplica N updates em uma transação, dispara `wa_recalc_campaign_progress` **uma vez** no fim.
- Debounce do trigger `trg_wa_recipient_touch`: hoje ele recalcula progresso a cada linha; passar para "marcar dirty + recalcular no fim do batch" via `pg_notify` / worker.
- Alternativa mais simples se você preferir manter o trigger: fazer o worker enviar sempre em lotes de 100–500 via a RPC.

## Frente 6 — Índices e VACUUM
- Novos: `campaign_recipients (workspace_id, status)` para o dashboard cross-campanha; parcial `(campaign_id) WHERE status IN ('failed','pending')` só se necessário depois de medir.
- Rodar `VACUUM ANALYZE campaign_recipients, contact_list_items` (a tabela sofre muitos UPDATE — bloat provável).
- Considerar `autovacuum_vacuum_scale_factor = 0.05` em `campaign_recipients` (tabela muito quente).

## Frente 7 — Compute (último recurso, após 1–6)
- Se depois das 6 frentes ainda houver saturação sob 1M + várias campanhas simultâneas, propor upgrade do Lovable Cloud (mais CPU/RAM/IO). Não é a primeira alavanca.

---

# Ordem sugerida de entrega

1. **Frente 1** (desnormalizar `contact_name`) — migration + backfill + refactor das server functions. Corta ~2h de banco/dia.
2. **Frente 2** (`progress` no lugar de `count=exact`) — só código de leitura, sem migration. Corta os timeouts de 7s no /admin.
3. **Frente 4** (polling + realtime) — só frontend, alívio imediato durante disparos.
4. **Frente 3** (paginação server-side) — refactor maior; libera as listas gerais.
5. **Frente 5** (batch de UPDATEs no worker) — melhora concorrência entre worker e painel.
6. **Frente 6** (índices/vacuum) — ajuste fino.
7. **Frente 7** (compute) — só se necessário.

**Estimativa realista:** frentes 1+2+4 em uma leva já derrubam >70% da lentidão percebida no /admin. Frente 3 e 5 são o restante.

---

## Detalhes técnicos (para referência)

- Migration Frente 1: `ALTER TABLE campaign_recipients ADD COLUMN contact_name text; UPDATE ... SET contact_name = c.name FROM contacts c WHERE c.id = campaign_recipients.contact_id;` (em lotes por `id` para não bloquear). Reescrever `wa_build_recipients` para popular a coluna.
- Arquivos que devem trocar `contact:contacts(name)` por `contact_name`: `src/lib/campaigns.functions.ts`, `src/lib/wa-campaigns.functions.ts`, `src/lib/wa-reports.functions.ts`, `src/lib/admin-dispatch.functions.ts`, `src/routes/_authenticated/admin.disparos.$id.tsx`, `src/routes/_authenticated/admin.campaigns.$id.tsx`.
- Frente 3: `validateSearch` (zod) nas rotas + `loaderDeps` + `.range()`.
- Frente 5: nova RPC `wa_apply_recipient_events` em `supabase/migrations`; alterar `src/lib/wa-campaign-runner.functions.ts` e `src/routes/api/public/whatsapp/queue-tick.tsx`.

---

**Confirma o plano assim ou quer ajustar prioridade / recortar alguma frente antes de eu começar pela Frente 1?**
