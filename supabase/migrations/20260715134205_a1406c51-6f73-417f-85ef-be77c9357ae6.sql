CREATE OR REPLACE FUNCTION public.wa_build_recipients(_campaign_id uuid, _list_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inserted integer := 0;
BEGIN
  ALTER TABLE public.campaign_recipients DISABLE TRIGGER trg_wa_recipient_progress;

  DELETE FROM public.campaign_recipients WHERE campaign_id = _campaign_id;

  WITH src AS (
    SELECT DISTINCT ON (regexp_replace(c.phone, '\D', '', 'g'))
      c.id AS contact_id,
      regexp_replace(c.phone, '\D', '', 'g') AS phone,
      c.name AS name
    FROM public.contact_list_items i
    JOIN public.contacts c ON c.id = i.contact_id
    LEFT JOIN public.opt_outs o ON o.phone = c.phone
    WHERE i.list_id = _list_id
      AND c.phone IS NOT NULL
      AND c.opt_in IS NOT FALSE
      AND c.opt_out IS NOT TRUE
      AND o.phone IS NULL
      AND regexp_replace(c.phone, '\D', '', 'g') <> ''
  ), ins AS (
    INSERT INTO public.campaign_recipients (campaign_id, contact_id, phone, variables, status)
    SELECT _campaign_id, contact_id, phone,
      CASE WHEN name IS NOT NULL THEN jsonb_build_object('nome', name, 'name', name) ELSE '{}'::jsonb END,
      'pending'
    FROM src
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  ALTER TABLE public.campaign_recipients ENABLE TRIGGER trg_wa_recipient_progress;

  UPDATE public.wa_campaigns SET total_recipients = v_inserted WHERE id = _campaign_id;
  PERFORM public.wa_recalc_campaign_progress(_campaign_id);
  RETURN v_inserted;
EXCEPTION WHEN OTHERS THEN
  BEGIN ALTER TABLE public.campaign_recipients ENABLE TRIGGER trg_wa_recipient_progress; EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END $$;

SELECT public.wa_build_recipients('6bcb8865-9cd1-4000-a149-bbe82c6c8ad5','2a9dd9fb-e113-47a5-8faf-f01e112622cf');