CREATE OR REPLACE FUNCTION public.wa_filter_recipients_by_ddd(_campaign_id uuid, _ddd text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
BEGIN
  IF _ddd IS NULL OR btrim(_ddd) = '' THEN
    SELECT count(*) INTO remaining FROM public.campaign_recipients WHERE campaign_id = _campaign_id;
    RETURN remaining;
  END IF;

  DELETE FROM public.campaign_recipients cr
  WHERE cr.campaign_id = _campaign_id
    AND COALESCE(
      CASE
        WHEN length(regexp_replace(cr.phone, '\D', '', 'g')) >= 12
             AND left(regexp_replace(cr.phone, '\D', '', 'g'), 2) = '55'
          THEN substr(regexp_replace(cr.phone, '\D', '', 'g'), 3, 2)
        ELSE left(regexp_replace(cr.phone, '\D', '', 'g'), 2)
      END, '') <> _ddd;

  SELECT count(*) INTO remaining FROM public.campaign_recipients WHERE campaign_id = _campaign_id;

  UPDATE public.wa_campaigns SET total_recipients = remaining WHERE id = _campaign_id;

  RETURN remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_filter_recipients_by_ddd(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_filter_recipients_by_ddd(uuid, text) TO service_role;