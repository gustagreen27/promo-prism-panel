UPDATE public.campaign_recipients
SET status = 'pending', failed_reason = NULL, error_code = NULL
WHERE campaign_id = 'd6b3a444-1b5c-4e4a-bf92-1059e9db5c6e'
  AND status = 'processing'
  AND meta_message_id IS NULL;

UPDATE public.wa_campaigns
SET worker_lease_id = NULL,
    worker_lease_until = NULL,
    last_error = NULL,
    pause_reason = NULL
WHERE id = 'd6b3a444-1b5c-4e4a-bf92-1059e9db5c6e';

SELECT public.wa_recalc_campaign_progress('d6b3a444-1b5c-4e4a-bf92-1059e9db5c6e');