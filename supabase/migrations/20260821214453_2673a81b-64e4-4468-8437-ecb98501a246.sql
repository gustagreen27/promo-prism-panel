ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS external_target_sent_count integer,
  ADD COLUMN IF NOT EXISTS external_target_delivered_count integer,
  ADD COLUMN IF NOT EXISTS external_target_failed_count integer;

UPDATE public.wa_campaigns
SET external_target_sent_count = COALESCE(external_target_sent_count, external_sent_count),
    external_target_delivered_count = COALESCE(external_target_delivered_count, external_delivered_count),
    external_target_failed_count = COALESCE(external_target_failed_count, external_failed_count)
WHERE execution_type = 'external';