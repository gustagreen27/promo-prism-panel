-- Frente 1: desnormalizar contacts.name em campaign_recipients
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS contact_name text;

-- Backfill em uma passada (350k linhas, cabe em minutos)
UPDATE public.campaign_recipients r
SET contact_name = c.name
FROM public.contacts c
WHERE c.id = r.contact_id
  AND r.contact_name IS NULL
  AND c.name IS NOT NULL;

-- Reescrever wa_build_recipients para popular contact_name
CREATE OR REPLACE FUNCTION public.wa_build_recipients(_campaign_id uuid, _list_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    INSERT INTO public.campaign_recipients (campaign_id, contact_id, phone, contact_name, variables, status)
    SELECT _campaign_id, contact_id, phone, name,
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
END $function$;