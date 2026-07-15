# Simulação de progresso na página pública

Adiciona uma camada de apresentação para a página pública `/campaigns/:id` que permite simular o andamento de um disparo — sem tocar em nada operacional. Toda a configuração vive dentro do diálogo "Personalizar página pública" já existente em `/admin/campanhas`.

## Princípio de isolamento

A simulação é **puramente visual**. Ela nunca é lida pelo worker, pela fila, por `/admin/disparos`, pelos webhooks da Meta, nem por qualquer rotina de envio. Os campos ficam num único JSON `public_overrides.simulation` na tabela `campaigns` e são aplicados **apenas** dentro do handler `getPublicCampaignReport` e na renderização do relatório público (+ PDF impresso).

## O que o admin poderá configurar

Dentro do diálogo, uma nova seção "Personalizar progresso em tempo real" com:

**Modo de exibição** (uma escolha):
- Real — usa os números reais do disparo (padrão)
- Personalizado — usa apenas os valores simulados
- Real com ajuste — usa dados reais + acréscimo simulado somado

**Parâmetros de tempo**
- Início público (data + hora)
- Duração estimada (minutos ou horas)
- Conclusão prevista (calculada, editável)
- Intervalo de atualização da página pública (segundos)

**Velocidades**
- Enviados por segundo/minuto/hora
- Entregues por segundo/minuto/hora (ou % sobre enviados)
- Falhas por segundo/minuto/hora (ou % sobre enviados)
- Cliques por intervalo configurável

**Volume e progresso**
- Total público de contatos
- Percentual inicial e percentual máximo
- Momento em que a campanha deve aparecer como concluída

**Curva de crescimento** (uma escolha):
- Linear
- Aleatório dentro de faixa (min/max por intervalo)
- Baseado em etapas (lista de marcos: `t → sent`)
- Real com multiplicador visual
- Somente ao recarregar a página
- Automático em tempo real

**Pausas programadas** (lista):
- Após X envios públicos
- Duração da pausa
- Status exibido durante a pausa
- Se recalcula ou não a conclusão prevista

**Status públicos personalizados** — rótulos livres para cada estado (agendada, preparando, em execução, processando, pausada, retomando, finalizando, concluída, cancelada) e qual estado forçar exibir agora (ou "auto" pelo tempo).

**Controles da simulação** (botões no diálogo)
- Prévia (renderiza os números para T=agora sem salvar)
- Iniciar simulação pública (define `sim_started_at = now()` e ativa)
- Pausar somente a simulação (não toca no disparo real)
- Retomar simulação
- Reiniciar progressão (zera `sim_started_at`)
- Sincronizar com dados reais (copia números reais para os overrides atuais)
- Desativar todas as personalizações (limpa `public_overrides`)

**Metadados**
- Última alteração (`updated_at`, `updated_by`)
- Badge "Dados públicos personalizados" visível no card da campanha em `/admin/campanhas`

## Como a página pública calcula em tempo real

Sem servidor extra: o handler retorna a configuração e um `server_now` (ISO). O componente React tem um timer que, no intervalo configurado (`refetch_interval_sec`, default 5s), recomputa localmente:

```text
elapsed_ms = clock_now - sim_started_at - pausas_ativas
progress   = curva(elapsed_ms, duration, total, initial%, max%)
sent       = progress * total
delivered  = sent * delivery_rate
failed     = sent * failure_rate
status     = auto_status_by_time(elapsed_ms) OR override_status
clicks     = interpolação(clicks_per_interval)
```

As pausas programadas são aplicadas subtraindo-se as janelas já ativadas do `elapsed_ms`. Assim a página parece "viva" mesmo sem novo fetch. Um refetch periódico ao servidor (no `refetch_interval`) garante que mudanças de config apareçam.

No modo "real com ajuste" os números reais vindos de `wa_campaigns` são somados aos valores simulados; nunca escritos de volta.

## UI

- **Diálogo** `PublicOverridesDialog` ganha abas: `Números fixos` (já existe) | `Progresso em tempo real` (novo) | `Prévia`. A aba "Prévia" mostra um mini-relatório com os números projetados nos próximos 30/60/240 min.
- **Card em `/admin/campanhas`**: quando `public_overrides` não estiver vazio, mostra badge âmbar `Dados públicos personalizados` ao lado do status.
- **Página pública** `/campaigns/:id`: quando o modo `personalizado` ou `real com ajuste` estiver ativo, o `DispatchCard` usa o cálculo simulado para `sent/delivered/failed/percent`, o header exibe o status público personalizado e o rodapé mostra "Previsão de conclusão: HH:MM".

## Detalhes técnicos

**Migração**
- Não cria coluna nova. A coluna `campaigns.public_overrides jsonb` (já existente) recebe uma sub-chave `simulation` com o schema abaixo. Isolamento total do restante.
- Índice/policy: nada muda; leitura pública continua via `supabaseAdmin` no server fn público.

**Schema `public_overrides.simulation`** (Zod validado no server fn `updateCampaignPublicOverrides`)

```ts
{
  mode: "real" | "custom" | "real_plus",
  refetch_interval_sec: number,       // 3..120
  start_at: string | null,            // ISO
  duration_minutes: number | null,
  ends_at: string | null,             // opcional, sobrepõe duration
  total_contacts: number | null,
  initial_percent: number,            // 0..100
  max_percent: number,                // 0..100
  send_rate: { value: number; unit: "s" | "m" | "h" } | null,
  delivered: { mode: "rate" | "percent"; value: number; unit?: "s"|"m"|"h" } | null,
  failed:    { mode: "rate" | "percent"; value: number; unit?: "s"|"m"|"h" } | null,
  clicks:    { per_interval: number; interval_sec: number } | null,
  growth: {
    kind: "linear" | "random" | "stepped" | "real_multiplier" | "on_reload" | "realtime",
    random_min?: number, random_max?: number,
    steps?: { t_sec: number; sent: number }[],
    multiplier?: number,
  },
  pauses: { after_sent: number; duration_sec: number; status_label?: string; recalc_eta: boolean }[],
  status: {
    override?: string | null,         // força um status; null = auto
    labels: Partial<Record<
      "scheduled"|"preparing"|"running"|"processing"|"paused"|"resuming"|"finishing"|"completed"|"cancelled",
      string
    >>,
  },
  complete_at: string | null,         // marca a campanha como concluída publicamente neste momento
  runtime: {                          // controles da simulação
    active: boolean,
    sim_started_at: string | null,    // ISO
    sim_paused_at: string | null,     // ISO — pausa manual
    accumulated_pause_ms: number,     // pausas fechadas
  },
  updated_at: string,
  updated_by: string | null,
}
```

**Server functions** (`src/lib/campaigns.functions.ts`)
- `updateCampaignPublicOverrides` — estender o `publicOverridesSchema` com `simulation` (opcional).
- Nova `controlCampaignSimulation({ id, action })` onde `action ∈ start | pause | resume | restart | sync_real | disable`. Faz apenas UPDATE em `public_overrides.simulation.runtime` (e em `sync_real`, copia números reais para os campos fixos). Nada mais.
- `getPublicCampaignReport` retorna `overrides` inteiro (já retorna) + `server_now: new Date().toISOString()` para o cliente calcular deriva.

**Cliente**
- Novo hook `useSimulatedProgress(overrides, realDispatch, serverNow)` — retorna `{ sent, delivered, failed, percent, statusLabel, etaAt }`. Reagenda um `setInterval` no `refetch_interval_sec`. Trata pausas manuais + programadas.
- `PublicOverridesDialog` ganha `Tabs` (números fixos / simulação / prévia) e os botões de controle da simulação.
- `admin.campanhas.tsx` — badge "Dados públicos personalizados" quando `Object.keys(public_overrides).length > 0`.
- `campaigns.$id.tsx` — quando `mode !== "real"`, usa o hook em vez dos números reais no `DispatchCard`; exibe status label e ETA.

## Arquivos afetados

- `src/lib/campaigns.functions.ts` — estender schema + nova `controlCampaignSimulation` + `server_now` no retorno público.
- `src/components/admin/public-overrides-dialog.tsx` — abas, formulário de simulação, botões de controle, prévia.
- `src/routes/campaigns.$id.tsx` — hook `useSimulatedProgress`, aplicação no `DispatchCard`, status label público.
- `src/routes/_authenticated/admin.campanhas.tsx` — badge de personalização.
- `src/lib/public-simulation.ts` (novo) — cálculo puro (linear/random/stepped/multiplier/etc), aplicação de pausas e derivação de status/ETA. Compartilhado entre server (prévia) e cliente.

## Fora do escopo (garantia de isolamento)

Não altera: `wa_campaign_runner`, `wa_campaigns`, `campaign_recipients`, triggers de progresso, edge functions, `has_role`, RLS. Nenhum código de disparo lê `public_overrides`.
