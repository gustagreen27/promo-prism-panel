UPDATE public.wa_campaigns
SET worker_lease_id = NULL,
    worker_lease_until = NULL,
    last_error = NULL,
    updated_at = clock_timestamp()
WHERE id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25';

UPDATE public.campaign_recipients
SET status = 'pending',
    failed_reason = NULL,
    error_code = NULL,
    next_attempt_at = NULL
WHERE campaign_id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25'
  AND status = 'processing'
  AND meta_message_id IS NULL
  AND last_attempt_at < (clock_timestamp() - interval '20 seconds');

INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
VALUES (
  'cf31166b-1b8d-4e59-9ae8-9801334fce25',
  'throughput_fix',
  'Lease destravado para eliminar pausa entre ciclos de envio',
  jsonb_build_object('lease_reset', true, 'processing_stale_seconds', 20)
);