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
    WHERE i.list_id = _list_id
      AND c.phone IS NOT NULL
      AND regexp_replace(c.phone, '\D', '', 'g') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.recipient_suppression s
        WHERE s.phone_normalized = regexp_replace(c.phone, '\D', '', 'g')
          AND (s.permanent OR s.expires_at IS NULL OR s.expires_at > now())
      )
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
END
$function$;

CREATE OR REPLACE FUNCTION public.wa_split_build_recipients(_campaign_ids uuid[], _list_id uuid, _weights integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer := 0;
  v_sum   numeric := 0;
  v_cum   numeric := 0;
  v_prev  numeric := 0;
  v_lo    integer;
  v_hi    integer;
  v_n     integer;
  v_i     integer;
  v_ins   integer;
  v_out   jsonb := '[]'::jsonb;
BEGIN
  v_n := coalesce(array_length(_campaign_ids, 1), 0);
  IF v_n = 0 THEN RETURN v_out; END IF;
  IF coalesce(array_length(_weights, 1), 0) <> v_n THEN
    RAISE EXCEPTION 'weights length must match campaign_ids length';
  END IF;

  FOR v_i IN 1..v_n LOOP
    v_sum := v_sum + greatest(coalesce(_weights[v_i], 0), 0);
  END LOOP;
  IF v_sum <= 0 THEN RAISE EXCEPTION 'sum of weights must be > 0'; END IF;

  ALTER TABLE public.campaign_recipients DISABLE TRIGGER trg_wa_recipient_progress;

  DELETE FROM public.campaign_recipients WHERE campaign_id = ANY(_campaign_ids);

  CREATE TEMP TABLE _wa_split_src ON COMMIT DROP AS
  SELECT row_number() OVER (ORDER BY md5(s.phone || _campaign_ids[1]::text)) AS rn,
         s.contact_id, s.phone, s.name
  FROM (
    SELECT DISTINCT ON (regexp_replace(c.phone, '\D', '', 'g'))
      c.id AS contact_id,
      regexp_replace(c.phone, '\D', '', 'g') AS phone,
      c.name AS name
    FROM public.contact_list_items i
    JOIN public.contacts c ON c.id = i.contact_id
    WHERE i.list_id = _list_id
      AND c.phone IS NOT NULL
      AND regexp_replace(c.phone, '\D', '', 'g') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.recipient_suppression sp
        WHERE sp.phone_normalized = regexp_replace(c.phone, '\D', '', 'g')
          AND (sp.permanent OR sp.expires_at IS NULL OR sp.expires_at > now())
      )
  ) s;

  SELECT count(*) INTO v_total FROM _wa_split_src;

  FOR v_i IN 1..v_n LOOP
    v_prev := v_cum;
    v_cum := v_cum + greatest(coalesce(_weights[v_i], 0), 0);
    v_lo := floor(v_total * v_prev / v_sum)::int + 1;
    v_hi := floor(v_total * v_cum / v_sum)::int;

    INSERT INTO public.campaign_recipients (campaign_id, contact_id, phone, contact_name, variables, status)
    SELECT _campaign_ids[v_i], t.contact_id, t.phone, t.name,
           CASE WHEN t.name IS NOT NULL THEN jsonb_build_object('nome', t.name, 'name', t.name) ELSE '{}'::jsonb END,
           'pending'
    FROM _wa_split_src t
    WHERE t.rn BETWEEN v_lo AND v_hi;

    GET DIAGNOSTICS v_ins = ROW_COUNT;

    UPDATE public.wa_campaigns SET total_recipients = v_ins WHERE id = _campaign_ids[v_i];
    PERFORM public.wa_recalc_campaign_progress(_campaign_ids[v_i]);

    v_out := v_out || jsonb_build_object('campaign_id', _campaign_ids[v_i], 'count', v_ins);
  END LOOP;

  ALTER TABLE public.campaign_recipients ENABLE TRIGGER trg_wa_recipient_progress;

  DROP TABLE IF EXISTS _wa_split_src;
  RETURN jsonb_build_object('total', v_total, 'legs', v_out);
EXCEPTION WHEN OTHERS THEN
  BEGIN ALTER TABLE public.campaign_recipients ENABLE TRIGGER trg_wa_recipient_progress; EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END $function$;