CREATE OR REPLACE FUNCTION public.wa_reserve_campaign_recipients(
  _campaign_id uuid,
  _limit integer,
  _locked_at timestamp with time zone DEFAULT clock_timestamp()
)
RETURNS TABLE(
  id uuid,
  phone text,
  variables jsonb,
  contact_id uuid,
  attempt integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT cr.id
    FROM public.campaign_recipients cr
    WHERE cr.campaign_id = _campaign_id
      AND cr.status = 'pending'
      AND (cr.next_attempt_at IS NULL OR cr.next_attempt_at <= _locked_at)
    ORDER BY cr.next_attempt_at ASC NULLS FIRST, cr.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  )
  UPDATE public.campaign_recipients cr
     SET status = 'processing',
         last_attempt_at = _locked_at
    FROM picked
   WHERE cr.id = picked.id
  RETURNING cr.id, cr.phone, cr.variables, cr.contact_id, cr.attempt;
$$;

REVOKE ALL ON FUNCTION public.wa_reserve_campaign_recipients(uuid, integer, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_reserve_campaign_recipients(uuid, integer, timestamp with time zone) TO service_role;