UPDATE public.wa_campaigns
SET rate_per_second = 80,
    max_concurrency = GREATEST(COALESCE(max_concurrency, 0), 800),
    batch_size = 80,
    worker_lease_id = NULL,
    worker_lease_until = NULL,
    last_error = NULL,
    updated_at = clock_timestamp()
WHERE id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25';

UPDATE public.whatsapp_connections wc
SET global_max_concurrency = GREATEST(COALESCE(global_max_concurrency, 0), 800),
    updated_at = clock_timestamp()
FROM public.wa_campaigns c
WHERE c.connection_id = wc.id
  AND c.id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25';

WITH target AS (
  SELECT wc.phone_number_id
  FROM public.wa_campaigns c
  JOIN public.whatsapp_connections wc ON wc.id = c.connection_id
  WHERE c.id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25'
)
UPDATE public.wa_rate_limits rl
SET active_inflight = 0,
    max_concurrency = GREATEST(COALESCE(rl.max_concurrency, 0), 800),
    global_max_concurrency = GREATEST(COALESCE(rl.global_max_concurrency, 0), 800),
    tokens = GREATEST(COALESCE(rl.tokens, 0), 80),
    last_refill_at = clock_timestamp(),
    slot_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
FROM target
WHERE rl.phone_number_id = target.phone_number_id;

UPDATE public.campaign_recipients
SET status = 'pending',
    failed_reason = NULL,
    error_code = NULL,
    next_attempt_at = NULL
WHERE campaign_id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25'
  AND status = 'processing'
  AND meta_message_id IS NULL;

INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
VALUES (
  'cf31166b-1b8d-4e59-9ae8-9801334fce25',
  'throughput_fix',
  'Concorrência elevada para sustentar 80 req/s contínuos com latência da Meta',
  jsonb_build_object('rate_per_second', 80, 'max_concurrency', 800, 'global_max_concurrency', 800)
);