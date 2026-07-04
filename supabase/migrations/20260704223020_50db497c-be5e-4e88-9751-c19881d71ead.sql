
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS default_minimum_messages integer NOT NULL DEFAULT 2500;

ALTER TABLE public.workspace_wallets
  ADD COLUMN IF NOT EXISTS custom_minimum_messages integer;

CREATE OR REPLACE FUNCTION public.wallet_minimum_messages(_ws uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT custom_minimum_messages FROM public.workspace_wallets WHERE workspace_id=_ws),
    (SELECT default_minimum_messages FROM public.billing_settings WHERE id=1),
    2500
  );
$$;

CREATE OR REPLACE FUNCTION public.wallet_required_deposit_cents(_ws uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(
    (SELECT minimum_deposit_cents FROM public.billing_settings WHERE id=1)::bigint,
    (public.wallet_effective_price(_ws)::bigint) * (public.wallet_minimum_messages(_ws)::bigint)
  );
$$;
