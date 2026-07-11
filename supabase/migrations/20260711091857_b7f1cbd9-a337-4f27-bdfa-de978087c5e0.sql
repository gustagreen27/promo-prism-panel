CREATE OR REPLACE FUNCTION public.wa_recalc_campaign_progress(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int := 0;
  c_pending int := 0;
  c_processing int := 0;
  c_sent int := 0;
  c_delivered int := 0;
  c_read int := 0;
  c_replied int := 0;
  c_failed int := 0;
  c_optout int := 0;
  c_cancelled int := 0;
  c_skipped int := 0;
  c_accepted int := 0;
  rec RECORD;
  v_sent_total int := 0;
  v_delivered_total int := 0;
  v_read_total int := 0;
  v_processed int := 0;
BEGIN
  FOR rec IN
    SELECT status, count(*) AS n
    FROM public.campaign_recipients
    WHERE campaign_id = _campaign_id
    GROUP BY status
  LOOP
    total := total + rec.n;
    CASE rec.status::text
      WHEN 'pending' THEN c_pending := rec.n;
      WHEN 'processing' THEN c_processing := rec.n;
      WHEN 'accepted' THEN c_accepted := rec.n;
      WHEN 'sent' THEN c_sent := rec.n;
      WHEN 'delivered' THEN c_delivered := rec.n;
      WHEN 'read' THEN c_read := rec.n;
      WHEN 'replied' THEN c_replied := rec.n;
      WHEN 'failed' THEN c_failed := rec.n;
      WHEN 'opt_out' THEN c_optout := rec.n;
      WHEN 'cancelled' THEN c_cancelled := rec.n;
      WHEN 'skipped' THEN c_skipped := rec.n;
      ELSE NULL;
    END CASE;
  END LOOP;

  v_sent_total := c_accepted + c_sent + c_delivered + c_read + c_replied;
  v_delivered_total := c_delivered + c_read + c_replied;
  v_read_total := c_read + c_replied;
  v_processed := total - c_pending - c_processing;

  UPDATE public.wa_campaigns SET
    progress = jsonb_build_object(
      'total', total,
      'pending', c_pending,
      'processing', c_processing,
      'accepted', c_accepted,
      'sent', v_sent_total,
      'delivered', v_delivered_total,
      'read', v_read_total,
      'replied', c_replied,
      'failed', c_failed,
      'opt_out', c_optout,
      'cancelled', c_cancelled,
      'skipped', c_skipped,
      'processed', v_processed,
      'percent', CASE WHEN total > 0
        THEN round((v_processed::numeric / total::numeric) * 100, 2)
        ELSE 0 END
    ),
    total_recipients = total,
    sent_count = v_sent_total,
    delivered_count = v_delivered_total,
    read_count = v_read_total,
    replied_count = c_replied,
    failed_count = c_failed
  WHERE id = _campaign_id;
END;
$$;

UPDATE public.campaign_recipients
SET status = 'pending', failed_reason = NULL, error_code = NULL
WHERE campaign_id = 'd6b3a444-1b5c-4e4a-bf92-1059e9db5c6e'
  AND status = 'processing'
  AND meta_message_id IS NULL
  AND last_attempt_at < now() - interval '5 minutes';

SELECT public.wa_recalc_campaign_progress('d6b3a444-1b5c-4e4a-bf92-1059e9db5c6e');