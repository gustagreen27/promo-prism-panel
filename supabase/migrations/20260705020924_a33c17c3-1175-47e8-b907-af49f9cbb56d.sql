UPDATE public.billing_settings SET default_price_cents = 23, updated_at = now() WHERE id = 1;
INSERT INTO public.billing_settings (id, default_price_cents)
SELECT 1, 23 WHERE NOT EXISTS (SELECT 1 FROM public.billing_settings WHERE id = 1);