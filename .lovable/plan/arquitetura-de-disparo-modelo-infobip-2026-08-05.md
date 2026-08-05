# Arquitetura de disparo modelo Infobip

Trocar o modelo atual (1 worker por campanha, acordado por cron a cada tick) por
**submissão imediata + fila persistente + múltiplos workers paralelos por número**,
com status reais separados (fila / aceito pela Meta / entregue / lido / falha).

## 1. Submissão imediata ("Campanha submetida com sucesso")

- `Iniciar disparo` passa a chamar um único endpoint de submissão que:
  1. valida campanha, número(s) e template;
  2. dispara a inserção em massa dos destinatários (já feita em SQL, roda em bloco,
     sem laço na interface) — para bases grandes a inserção é dividida em blocos
     encadeados no servidor, não na tela;
  3. gera um `bulk_id` e responde na hora `{ bulk_id, total, status: "queued" }`;
  4. acorda os workers imediatamente (sem esperar o próximo ciclo).
- A tela mostra "Campanha submetida com sucesso — processamento em alta velocidade"
  assim que a resposta chega. Nada de aguardar percorrer contatos.

## 2. Fila persistente

Fila continua em Postgres (é a única opção compatível com a infraestrutura atual:
o backend roda em Workers/edge, sem Redis). O que muda:

- reserva de destinatários com `FOR UPDATE SKIP LOCKED` em blocos grandes;
- índice parcial por `(campaign_id, status, route_id)` para reserva O(1);
- idempotência: cada destinatário só sai da fila uma vez (`claim_token` único) e
  nenhuma linha com `meta_message_id` preenchido pode ser reenviada;
- retomada automática: linhas presas em `processing` voltam para a fila por idade.

## 3. Workers paralelos (fim do gargalo de 1 lane por campanha)

- Remover o lease único por campanha. O lease passa a ser por **lane**:
  `(campaign_id, route_id, lane_index)`, com N lanes por número.
- Cada lane roda em loop contínuo e se re-encadeia sozinha enquanto houver fila;
  o cron vira apenas *watchdog* (repõe lanes mortas), não o motor.
- Distribuição automática entre todos os números da campanha (rotas), cada número
  com seu próprio limitador e concorrência. Sem teto global: 5 números de 80 msg/s
  = 400 req/s.

## 4. Status reais

| Estado | Significado |
|---|---|
| `queued` | na fila, ainda não submetido à Meta |
| `accepted` | Meta retornou 200 + `wamid` (é o que conta como **Enviado**) |
| `delivered` | webhook |
| `read` | webhook |
| `failed` | erro definitivo da API ou webhook |

Contadores e páginas (admin e pública) passam a ler `accepted` como "enviado".
Nenhum número simulado — remoção do caminho de simulação nos relatórios reais.

## 5. Controle de erro por escopo

- `130429` / timeout / 5xx: reduz **apenas o número afetado** (throttle adaptativo),
  recuperação progressiva depois de estabilizar. Campanha não pausa.
- Erro definitivo de destinatário: marca `failed` e segue, sem afetar velocidade.
- `132015` / `132016`: bloqueia **apenas a rota/template** afetado; outras rotas seguem.
- Retry com backoff só para erro temporário; após N tentativas vai para
  dead-letter (`failed` + motivo), sem loop infinito.

## 6. Prioridade e tempo real

- Campanhas marcadas como urgentes recebem mais lanes na disputa por capacidade.
- Painel em tempo real por realtime/polling curto sobre os contadores reais.
- Webhooks continuam num caminho independente dos workers de envio.

## Detalhes técnicos

- Migração: novos campos de status/claim em `campaign_recipients`, tabela de lanes
  (`wa_worker_lanes`), throttle por número em `wa_rate_limits`, índices parciais,
  RPC de reserva com `SKIP LOCKED` por rota.
- Código: `src/lib/wa-queue.server.ts` (motor por lane), novo
  `src/lib/wa-submit.functions.ts` (submissão + bulk_id), `queue-tick.tsx` vira
  watchdog/lane-runner, ajustes nos contadores em `wa-campaign-runner.functions.ts`,
  `campaigns.$id.tsx` (público) e telas de admin.
- Compatibilidade: campanhas já em andamento continuam funcionando; os status
  antigos são mapeados para os novos na migração.

## Entrega em fases

1. Submissão imediata + bulk_id + mensagem na tela.
2. Lanes paralelas por número e fim do lease único.
3. Status reais separados e contadores/relatórios.
4. Throttle adaptativo por número, DLQ, prioridade.
