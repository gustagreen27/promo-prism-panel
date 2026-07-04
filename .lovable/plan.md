## Objetivo

Substituir o modelo de "estoque de mensagens" por uma **carteira em R$** por workspace, com cobrança automática por mensagem enviada, depósitos via Stripe (checkout hospedado) e controles administrativos completos.

---

## 1. Banco de dados (uma migration)

### Tabelas novas
- `billing_settings` (singleton): `default_price_cents int` (15), `minimum_deposit_cents int` (15000), `currency` ('BRL'), `updated_by`, `updated_at`.
- `workspace_wallets`: `workspace_id pk`, `balance_cents bigint default 0`, `reserved_cents bigint default 0`, `custom_price_cents int null`, `low_balance_alert_at`, timestamps.
- `wallet_transactions`: `id`, `workspace_id`, `type` (`deposit|message_charge|refund|adjustment|reservation_hold|reservation_release`), `amount_cents` (positivo/negativo), `balance_before_cents`, `balance_after_cents`, `campaign_id?`, `recipient_id?`, `deposit_id?`, `description`, `created_by?`, `created_at`.
- `deposits`: `id`, `workspace_id`, `amount_cents`, `status` (`pending|paid|failed|cancelled|expired`), `provider` ('stripe'), `stripe_session_id`, `stripe_payment_intent_id`, `payment_method`, `receipt_url`, `created_by`, `created_at`, `paid_at`.

### Alterações
- `wa_campaigns`: `price_cents_at_start int`, `reservation_id uuid null`, `charged_cents bigint default 0`.
- `campaign_recipients`: `charged_cents int default 0`, `charged_at timestamptz`.
- `message_stock_reservations` → renomear semanticamente para dinheiro: nova tabela `wallet_reservations` (`id`, `workspace_id`, `campaign_id`, `qty_reserved`, `qty_consumed`, `unit_price_cents`, `status` `held|consumed|released`, timestamps). Estoque antigo (`message_stock`) fica read-only para histórico.

### RLS
- `workspace_wallets`, `wallet_transactions`, `deposits`, `wallet_reservations`: SELECT para membros do workspace; INSERT/UPDATE só via server (service_role). Staff interno lê tudo.
- `billing_settings`: SELECT para `authenticated`, UPDATE só staff.

### Função auxiliar
- `debit_wallet(workspace_id, cents, type, meta jsonb) returns wallet_transactions` — transacional, checa saldo, atualiza `balance_cents`, insere linha em `wallet_transactions`. Nunca deixa saldo negativo.
- `credit_wallet(...)` análoga.
- `available_balance(workspace_id) = balance_cents - reserved_cents`.

---

## 2. Stripe (bring-your-own via `enable_stripe_payments` da Lovable)

- Ativar via `enable_stripe_payments` (Lovable-managed, sem chave manual).
- Método de pagamento: cartão + Pix (se aprovado na conta) + boleto opcional.
- **Tax:** `automatic_tax: { enabled: true }` (+0,5%).
- Sem produtos fixos: cada depósito cria um Checkout Session com `line_items` dinâmico (moeda BRL, valor escolhido pelo cliente ≥ minimum_deposit).
- Webhook em `/api/public/stripe/webhook` com verificação de assinatura HMAC:
  - `checkout.session.completed` → marca depósito como `paid`, credita carteira, insere `wallet_transactions`.
  - `payment_intent.payment_failed` → marca `failed`.
  - `charge.refunded` → cria `refund` negativo (débito).

---

## 3. Server functions

`src/lib/billing.functions.ts` (novo):
- **Cliente:**
  - `getMyWallet({workspace_id})` → saldo, reservado, preço aplicável.
  - `getMyPrice({workspace_id})` → `custom_price_cents ?? default_price_cents`.
  - `listMyTransactions({workspace_id, limit, offset, type?})`.
  - `listMyDeposits({workspace_id})`.
  - `createDepositCheckout({workspace_id, amount_cents})` → valida min, cria Stripe Checkout Session, retorna `url`.
- **Admin:**
  - `updateGlobalBillingSettings({default_price_cents, minimum_deposit_cents})`.
  - `setWorkspaceCustomPrice({workspace_id, custom_price_cents|null})`.
  - `adminAdjustWallet({workspace_id, amount_cents, description})` — ajuste manual (crédito/débito).
  - `listAllTransactions({filters})`.
  - `listAllDeposits({filters})`.

### Integração com dispatcher (`wa-send.server`, `wa-campaign-runner.functions`)
- **Ao dar Start em campanha:** calcula `unit_price = getMyPrice`, `total = unit_price * total_recipients`. Cria `wallet_reservations` (status `held`) e **incrementa `reserved_cents`**. Se `available_balance < total` → rejeita com erro `INSUFFICIENT_BALANCE`.
- **A cada mensagem aceita pela Meta (status `accepted`/`sent`):** `debit_wallet(unit_price, 'message_charge')`, decrementa `reserved_cents` em `unit_price`, incrementa `qty_consumed` na reservation, marca `campaign_recipients.charged_cents/charged_at`.
- **A cada falha permanente ou opt-out/skip:** decrementa `reserved_cents` sem debitar (`reservation_release`).
- **Ao concluir/cancelar campanha:** libera qualquer resíduo em `reserved_cents`, marca reservation `consumed` ou `released`.
- Antes de cada envio, revalida `balance_cents >= unit_price`; se acabou (ajuste manual, refund), pausa a campanha com motivo `balance_exhausted`.

---

## 4. UI — Painel do cliente (`/painel`)

- **Header do painel:** badge com "Saldo: R$ X,XX" (link para /painel/financeiro).
- **/painel/financeiro** (substituir stub):
  - Card grande: saldo disponível, reservado (em campanhas em andamento), preço por mensagem aplicado a este workspace.
  - Botão **"Depositar saldo"** → modal com input em R$, validação de mínimo (mostra "Mínimo R$ 150,00"), método (cartão/Pix), botão "Ir para pagamento" → redireciona Stripe Checkout. Retorno em `/painel/financeiro?deposit=success|cancel` com toast.
  - Tabela **Histórico de transações**: data, tipo (badge colorido), descrição, valor, saldo depois. Filtro por tipo e período. Paginação.
  - Tabela **Depósitos**: data, valor, status, método, link do recibo Stripe.
- **/painel/campanhas/nova (Etapa Revisão):** mostra custo estimado (`recipients × unit_price`), saldo atual, saldo pós-reserva. Botão "Iniciar" desabilitado se insuficiente com CTA "Depositar agora".
- **/painel/campanhas/[id]:** mostra `charged_cents` acumulado + reserva em aberto.
- **Alerta global** no layout quando `balance < 10 × unit_price`: "Saldo baixo — X mensagens restantes".

---

## 5. UI — Admin (`/admin`)

- **/admin/configuracoes** (aba nova **Cobrança**):
  - Campo `Valor padrão por mensagem (R$)`.
  - Campo `Depósito mínimo (R$)`.
  - Botão Salvar → `updateGlobalBillingSettings`.
- **/admin/clientes** — linha por workspace ganha coluna **Saldo** e **Preço/msg**.
- **/admin/clientes/[id]** (nova rota de detalhe): cards de Saldo, Reservado, Preço aplicado. Ações:
  - Selecionar "Usar valor padrão global" ou "Personalizado (R$ __)".
  - "Adicionar saldo manualmente" (crédito, com descrição obrigatória).
  - "Remover saldo" (débito, com descrição obrigatória).
  - Tabela de transações e depósitos do workspace.
- **/admin/financeiro** (rota nova): visão global de todas as transações e depósitos, filtros por workspace/tipo/status/período, export CSV.

---

## 6. Segurança e integridade

- Toda mutação em `workspace_wallets` e `wallet_transactions` só via server-fn com `requireSupabaseAuth` + verificação `is_workspace_member` OU `is_internal_staff`. Cliente **não escreve** direto.
- Uso das funções SQL `debit_wallet/credit_wallet` para garantir atomicidade (SELECT ... FOR UPDATE dentro da função).
- Webhook Stripe: verificação de assinatura antes de qualquer efeito, idempotente por `stripe_session_id` (unique).
- Nunca deletar transações; estornos são novas linhas negativas com `type=refund` e referência.
- Depósitos pendentes **não** entram no saldo — só ao receber `checkout.session.completed`.

---

## 7. Ordem de execução

1. Migration (tabelas, RLS, funções SQL, seed default 15¢ / R$150).
2. Ativar Stripe (`enable_stripe_payments`) — usuário preenche o formulário.
3. Server-fns de billing + integração no dispatcher (reserva/consumo/liberação).
4. Webhook Stripe + `createDepositCheckout`.
5. UI painel do cliente (/painel/financeiro + badge + wizard).
6. UI admin (Configurações › Cobrança, detalhe do cliente, /admin/financeiro).
7. Testes: fluxo completo depósito → campanha → cobrança → falha → refund.

---

## Perguntas antes de iniciar

1. **Confirma ativar Stripe agora?** Você vai preencher email/nome/empresa no formulário que a Lovable abre.
2. **Métodos de pagamento**: começar só com **cartão**, ou já quer Pix + boleto no Checkout (requer aprovação Stripe BR — geralmente automática, mas pode levar dias)?
3. Ao migrar, o **estoque atual de mensagens** dos workspaces existentes vira **saldo em R$** (convertido por `qty × preço padrão`) ou zera e cada cliente deposita do zero?
