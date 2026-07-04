
-- ============================================================
-- Carteira em R$ (billing) para SaaS Disparos FR
-- ============================================================

-- 1) Settings globais de cobrança (singleton via id=1)
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  default_price_cents integer NOT NULL DEFAULT 15,
  minimum_deposit_cents integer NOT NULL DEFAULT 15000,
  currency text NOT NULL DEFAULT 'BRL',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_billing_settings" ON public.billing_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_update_billing_settings" ON public.billing_settings
  FOR UPDATE TO authenticated USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
INSERT INTO public.billing_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 2) Carteira por workspace
CREATE TABLE IF NOT EXISTS public.workspace_wallets (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  reserved_cents bigint NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0),
  custom_price_cents integer,
  low_balance_alert_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_wallets TO authenticated;
GRANT ALL ON public.workspace_wallets TO service_role;
ALTER TABLE public.workspace_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_wallet" ON public.workspace_wallets FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.user_workspace_ids(auth.uid())) OR public.is_internal_staff(auth.uid()));

-- Cria wallet para todos os workspaces existentes (saldo zero)
INSERT INTO public.workspace_wallets (workspace_id)
  SELECT id FROM public.workspaces
  ON CONFLICT DO NOTHING;

-- Auto-cria wallet para novos workspaces
CREATE OR REPLACE FUNCTION public.ensure_workspace_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.workspace_wallets(workspace_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_workspaces_ensure_wallet ON public.workspaces;
CREATE TRIGGER trg_workspaces_ensure_wallet AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.ensure_workspace_wallet();

-- 3) Histórico de transações da carteira
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit','message_charge','refund','adjustment','reservation_hold','reservation_release')),
  amount_cents bigint NOT NULL,
  balance_before_cents bigint NOT NULL,
  balance_after_cents bigint NOT NULL,
  campaign_id uuid,
  recipient_id uuid,
  deposit_id uuid,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_ws_created ON public.wallet_transactions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON public.wallet_transactions(type);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_tx" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.user_workspace_ids(auth.uid())) OR public.is_internal_staff(auth.uid()));

-- 4) Depósitos (Stripe checkout sessions)
CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','expired')),
  provider text NOT NULL DEFAULT 'stripe',
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  payment_method text,
  receipt_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_deposits_ws_created ON public.deposits(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON public.deposits(status);
GRANT SELECT ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_deposits" ON public.deposits FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.user_workspace_ids(auth.uid())) OR public.is_internal_staff(auth.uid()));

-- 5) Reservas de saldo por campanha
CREATE TABLE IF NOT EXISTS public.wallet_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid,
  qty_reserved integer NOT NULL,
  qty_consumed integer NOT NULL DEFAULT 0,
  unit_price_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','consumed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_res_ws ON public.wallet_reservations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wallet_res_campaign ON public.wallet_reservations(campaign_id);
GRANT SELECT ON public.wallet_reservations TO authenticated;
GRANT ALL ON public.wallet_reservations TO service_role;
ALTER TABLE public.wallet_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_reservations" ON public.wallet_reservations FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.user_workspace_ids(auth.uid())) OR public.is_internal_staff(auth.uid()));

-- 6) Colunas em wa_campaigns e campaign_recipients
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS price_cents_at_start integer,
  ADD COLUMN IF NOT EXISTS reservation_id uuid,
  ADD COLUMN IF NOT EXISTS charged_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS charged_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charged_at timestamptz;

-- 7) Funções SQL: preço efetivo e mutações atômicas
CREATE OR REPLACE FUNCTION public.wallet_effective_price(_ws uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(
    (SELECT custom_price_cents FROM public.workspace_wallets WHERE workspace_id=_ws),
    (SELECT default_price_cents FROM public.billing_settings WHERE id=1),
    15
  );
$$;

CREATE OR REPLACE FUNCTION public.wallet_available(_ws uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(balance_cents - reserved_cents, 0)::bigint
  FROM public.workspace_wallets WHERE workspace_id=_ws;
$$;

-- Credita saldo (depósitos, ajustes positivos, refund positivo)
CREATE OR REPLACE FUNCTION public.wallet_credit(
  _ws uuid, _amount_cents bigint, _type text, _description text,
  _campaign_id uuid DEFAULT NULL, _deposit_id uuid DEFAULT NULL, _created_by uuid DEFAULT NULL
) RETURNS public.wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_before bigint; v_after bigint; v_tx public.wallet_transactions;
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;
  UPDATE public.workspace_wallets
    SET balance_cents = balance_cents + _amount_cents, updated_at = now()
    WHERE workspace_id = _ws
    RETURNING balance_cents - _amount_cents, balance_cents INTO v_before, v_after;
  IF NOT FOUND THEN
    INSERT INTO public.workspace_wallets(workspace_id, balance_cents) VALUES (_ws, _amount_cents);
    v_before := 0; v_after := _amount_cents;
  END IF;
  INSERT INTO public.wallet_transactions(workspace_id, type, amount_cents, balance_before_cents, balance_after_cents, campaign_id, deposit_id, description, created_by)
    VALUES (_ws, _type, _amount_cents, v_before, v_after, _campaign_id, _deposit_id, _description, _created_by)
    RETURNING * INTO v_tx;
  RETURN v_tx;
END $$;

-- Debita saldo (cobrança por mensagem, ajuste negativo, refund contábil)
CREATE OR REPLACE FUNCTION public.wallet_debit(
  _ws uuid, _amount_cents bigint, _type text, _description text,
  _campaign_id uuid DEFAULT NULL, _recipient_id uuid DEFAULT NULL, _created_by uuid DEFAULT NULL,
  _allow_negative boolean DEFAULT false
) RETURNS public.wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_before bigint; v_after bigint; v_tx public.wallet_transactions;
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;
  SELECT balance_cents INTO v_before FROM public.workspace_wallets
    WHERE workspace_id=_ws FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.workspace_wallets(workspace_id) VALUES (_ws);
    v_before := 0;
  END IF;
  IF NOT _allow_negative AND v_before < _amount_cents THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE' USING ERRCODE='P0001';
  END IF;
  v_after := v_before - _amount_cents;
  UPDATE public.workspace_wallets
    SET balance_cents = v_after, updated_at = now() WHERE workspace_id=_ws;
  INSERT INTO public.wallet_transactions(workspace_id, type, amount_cents, balance_before_cents, balance_after_cents, campaign_id, recipient_id, description, created_by)
    VALUES (_ws, _type, -_amount_cents, v_before, v_after, _campaign_id, _recipient_id, _description, _created_by)
    RETURNING * INTO v_tx;
  RETURN v_tx;
END $$;

-- Reserva saldo (não debita, só marca)
CREATE OR REPLACE FUNCTION public.wallet_reserve(
  _ws uuid, _campaign_id uuid, _qty integer, _unit_price_cents integer
) RETURNS public.wallet_reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_total bigint; v_avail bigint; v_res public.wallet_reservations;
BEGIN
  IF _qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;
  v_total := (_qty::bigint) * _unit_price_cents;
  SELECT balance_cents - reserved_cents INTO v_avail FROM public.workspace_wallets
    WHERE workspace_id=_ws FOR UPDATE;
  IF v_avail IS NULL OR v_avail < v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE' USING ERRCODE='P0001';
  END IF;
  UPDATE public.workspace_wallets SET reserved_cents = reserved_cents + v_total, updated_at=now()
    WHERE workspace_id=_ws;
  INSERT INTO public.wallet_reservations(workspace_id, campaign_id, qty_reserved, unit_price_cents)
    VALUES (_ws, _campaign_id, _qty, _unit_price_cents)
    RETURNING * INTO v_res;
  INSERT INTO public.wallet_transactions(workspace_id, type, amount_cents, balance_before_cents, balance_after_cents, campaign_id, description)
    SELECT _ws, 'reservation_hold', 0, balance_cents, balance_cents, _campaign_id,
      'Reserva para campanha (' || _qty || ' × ' || _unit_price_cents || 'c)'
    FROM public.workspace_wallets WHERE workspace_id=_ws;
  RETURN v_res;
END $$;

-- Consome N unidades da reserva (efetua débito real)
CREATE OR REPLACE FUNCTION public.wallet_consume_reservation(
  _reservation_id uuid, _recipient_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_res public.wallet_reservations; v_price integer;
BEGIN
  SELECT * INTO v_res FROM public.wallet_reservations WHERE id=_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'held' THEN RETURN false; END IF;
  IF v_res.qty_consumed >= v_res.qty_reserved THEN RETURN false; END IF;
  v_price := v_res.unit_price_cents;
  UPDATE public.workspace_wallets SET reserved_cents = GREATEST(reserved_cents - v_price, 0), updated_at=now()
    WHERE workspace_id=v_res.workspace_id;
  PERFORM public.wallet_debit(v_res.workspace_id, v_price, 'message_charge',
    'Cobrança por mensagem enviada', v_res.campaign_id, _recipient_id, NULL, true);
  UPDATE public.wallet_reservations SET qty_consumed=qty_consumed+1, updated_at=now(),
    status = CASE WHEN qty_consumed+1 >= qty_reserved THEN 'consumed' ELSE 'held' END
    WHERE id=_reservation_id;
  IF _recipient_id IS NOT NULL THEN
    UPDATE public.campaign_recipients SET charged_cents=v_price, charged_at=now() WHERE id=_recipient_id;
  END IF;
  IF v_res.campaign_id IS NOT NULL THEN
    UPDATE public.wa_campaigns SET charged_cents = charged_cents + v_price WHERE id=v_res.campaign_id;
  END IF;
  RETURN true;
END $$;

-- Libera N unidades da reserva (sem debitar)
CREATE OR REPLACE FUNCTION public.wallet_release_reservation(
  _reservation_id uuid, _qty integer DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_res public.wallet_reservations; v_remaining integer; v_release_qty integer; v_amount bigint;
BEGIN
  SELECT * INTO v_res FROM public.wallet_reservations WHERE id=_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_remaining := v_res.qty_reserved - v_res.qty_consumed;
  v_release_qty := COALESCE(_qty, v_remaining);
  IF v_release_qty <= 0 THEN RETURN false; END IF;
  IF v_release_qty > v_remaining THEN v_release_qty := v_remaining; END IF;
  v_amount := (v_release_qty::bigint) * v_res.unit_price_cents;
  UPDATE public.workspace_wallets SET reserved_cents = GREATEST(reserved_cents - v_amount, 0), updated_at=now()
    WHERE workspace_id=v_res.workspace_id;
  UPDATE public.wallet_reservations SET qty_reserved = qty_reserved - v_release_qty, updated_at=now(),
    status = CASE WHEN (qty_reserved - v_release_qty) <= qty_consumed THEN 'released' ELSE status END
    WHERE id=_reservation_id;
  INSERT INTO public.wallet_transactions(workspace_id, type, amount_cents, balance_before_cents, balance_after_cents, campaign_id, description)
    SELECT v_res.workspace_id, 'reservation_release', 0, balance_cents, balance_cents, v_res.campaign_id,
      'Liberação de ' || v_release_qty || ' unidade(s) reservada(s)'
    FROM public.workspace_wallets WHERE workspace_id=v_res.workspace_id;
  RETURN true;
END $$;
