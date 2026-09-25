-- lovable-cron-fallback-reviewed: webhook do Inter exige mTLS de entrada indisponível; job só existe enquanto há Pix pendente (liga ao criar cobrança, desliga ao esvaziar), no máximo 1 run/min
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS pix_txid text,
  ADD COLUMN IF NOT EXISTS pix_copia_cola text,
  ADD COLUMN IF NOT EXISTS pix_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pix_e2eid text,
  ADD COLUMN IF NOT EXISTS paid_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_deposits_pix_txid ON public.deposits(pix_txid) WHERE pix_txid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deposits_pix_e2eid ON public.deposits(pix_e2eid) WHERE pix_e2eid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_pending_inter ON public.deposits(last_checked_at) WHERE status = 'pending' AND provider = 'inter';
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_deposit_once ON public.wallet_transactions(deposit_id) WHERE type = 'deposit' AND deposit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.confirm_pix_deposit(_deposit_id uuid, _e2eid text, _paid_cents bigint)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.deposits;
BEGIN
  SELECT * INTO d FROM public.deposits WHERE id = _deposit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF d.status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF _paid_cents IS NULL OR _paid_cents < d.amount_cents THEN
    UPDATE public.deposits SET error_message = 'Valor pago diferente do cobrado', paid_amount_cents = _paid_cents WHERE id = _deposit_id;
    RETURN 'amount_mismatch';
  END IF;
  UPDATE public.deposits
    SET status = 'paid', paid_at = now(), pix_e2eid = _e2eid, paid_amount_cents = _paid_cents,
        provider_status = 'CONCLUIDA', error_message = NULL
    WHERE id = _deposit_id;
  PERFORM public.wallet_credit(d.workspace_id, d.amount_cents, 'deposit',
    'Depósito Pix ' || left(d.id::text, 8) || ' confirmado', NULL, d.id, d.created_by);
  RETURN 'credited';
END $$;
REVOKE ALL ON FUNCTION public.confirm_pix_deposit(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pix_deposit(uuid, text, bigint) TO service_role;

-- Liga a verificação periódica (idempotente).
CREATE OR REPLACE FUNCTION public.inter_pix_poll_start()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inter-pix-poll') THEN
    PERFORM cron.schedule('inter-pix-poll', '* * * * *', $job$
      SELECT net.http_post(
        url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8-dev.lovable.app/api/public/hooks/inter-pix-poll',
        headers := public.cron_headers('cron-1min'),
        body := '{}'::jsonb
      );
    $job$);
  END IF;
END $$;

-- Desliga quando não há mais Pix pendente.
CREATE OR REPLACE FUNCTION public.inter_pix_poll_stop_if_idle()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.deposits WHERE status = 'pending' AND provider = 'inter') THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inter-pix-poll') THEN
    PERFORM cron.unschedule('inter-pix-poll');
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.inter_pix_poll_start() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inter_pix_poll_stop_if_idle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inter_pix_poll_start() TO service_role;
GRANT EXECUTE ON FUNCTION public.inter_pix_poll_stop_if_idle() TO service_role;