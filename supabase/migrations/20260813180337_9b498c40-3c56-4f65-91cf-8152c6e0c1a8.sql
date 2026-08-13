-- ============ 1. DEAD LETTERS ============
CREATE TABLE IF NOT EXISTS public.message_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid,
  workspace_id uuid,
  phone text NOT NULL,
  phone_normalized text GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
  error_code text,
  error_title text,
  error_message text,
  category text NOT NULL DEFAULT 'RETRYABLE',
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  phone_number_id text,
  route_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.message_dead_letters TO authenticated;
GRANT ALL ON public.message_dead_letters TO service_role;
ALTER TABLE public.message_dead_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read dead letters" ON public.message_dead_letters;
CREATE POLICY "staff read dead letters" ON public.message_dead_letters
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_dead_letters_campaign ON public.message_dead_letters(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dead_letters_code ON public.message_dead_letters(campaign_id, error_code);
CREATE INDEX IF NOT EXISTS idx_dead_letters_phone ON public.message_dead_letters(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_dead_letters_recipient ON public.message_dead_letters(recipient_id);

-- ============ 2. RECIPIENT SUPPRESSION ============
CREATE TABLE IF NOT EXISTS public.recipient_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  reason text NOT NULL DEFAULT 'manual',
  error_code text,
  note text,
  failure_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  permanent boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_normalized, scope)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipient_suppression TO authenticated;
GRANT ALL ON public.recipient_suppression TO service_role;
ALTER TABLE public.recipient_suppression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage suppression" ON public.recipient_suppression;
CREATE POLICY "staff manage suppression" ON public.recipient_suppression
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_suppression_phone ON public.recipient_suppression(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_suppression_active ON public.recipient_suppression(phone_normalized, permanent, expires_at);
CREATE INDEX IF NOT EXISTS idx_suppression_reason ON public.recipient_suppression(reason, last_seen_at DESC);

DROP TRIGGER IF EXISTS trg_suppression_updated_at ON public.recipient_suppression;
CREATE TRIGGER trg_suppression_updated_at BEFORE UPDATE ON public.recipient_suppression
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3. HELPERS ============
CREATE OR REPLACE FUNCTION public.wa_suppression_add(
  _phone text,
  _reason text DEFAULT 'manual',
  _error_code text DEFAULT NULL,
  _permanent boolean DEFAULT false,
  _ttl_days integer DEFAULT NULL,
  _note text DEFAULT NULL,
  _created_by uuid DEFAULT NULL
) RETURNS public.recipient_suppression
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_row public.recipient_suppression;
BEGIN
  v_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF v_phone = '' THEN RAISE EXCEPTION 'telefone inválido'; END IF;

  INSERT INTO public.recipient_suppression AS s
    (phone_normalized, scope, reason, error_code, note, permanent, expires_at, created_by)
  VALUES (v_phone, 'global', _reason, _error_code, _note, _permanent,
          CASE WHEN _permanent THEN NULL
               WHEN _ttl_days IS NOT NULL THEN now() + make_interval(days => _ttl_days)
               ELSE NULL END,
          _created_by)
  ON CONFLICT (phone_normalized, scope) DO UPDATE
    SET failure_count = s.failure_count + 1,
        last_seen_at  = now(),
        reason        = EXCLUDED.reason,
        error_code    = coalesce(EXCLUDED.error_code, s.error_code),
        note          = coalesce(EXCLUDED.note, s.note),
        permanent     = s.permanent OR EXCLUDED.permanent,
        expires_at    = CASE WHEN s.permanent OR EXCLUDED.permanent THEN NULL
                             ELSE greatest(coalesce(s.expires_at, now()), coalesce(EXCLUDED.expires_at, now())) END
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Registra falha definitiva de destinatário; só suprime ao atingir o limiar.
CREATE OR REPLACE FUNCTION public.wa_suppression_register_failure(
  _phone text,
  _error_code text,
  _threshold integer DEFAULT 3,
  _ttl_days integer DEFAULT 30
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_count integer;
BEGIN
  v_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF v_phone = '' THEN RETURN false; END IF;

  SELECT count(*) INTO v_count
  FROM public.message_dead_letters d
  WHERE d.phone_normalized = v_phone
    AND d.category = 'RECIPIENT_SUPPRESSION'
    AND d.created_at > now() - interval '90 days';

  IF v_count < _threshold THEN RETURN false; END IF;

  PERFORM public.wa_suppression_add(v_phone, 'repeated_hard_failure', _error_code, false, _ttl_days,
    format('%s falhas definitivas em 90 dias', v_count), NULL);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.wa_suppression_is_active(_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipient_suppression s
    WHERE s.phone_normalized = regexp_replace(coalesce(_phone,''), '\D', '', 'g')
      AND (s.permanent OR s.expires_at IS NULL OR s.expires_at > now())
  )
$$;

-- ============ 4. MOTIVOS DE FALHA ============
CREATE OR REPLACE FUNCTION public.wa_campaign_failure_reasons(_campaign_id uuid)
RETURNS TABLE(error_code text, sample_reason text, total bigint, pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (
    SELECT coalesce(nullif(r.error_code,''), 'desconhecido') AS code,
           r.failed_reason
    FROM public.campaign_recipients r
    WHERE r.campaign_id = _campaign_id AND r.status = 'failed'
  ), t AS (SELECT count(*)::numeric AS n FROM f)
  SELECT f.code,
         (array_agg(f.failed_reason) FILTER (WHERE f.failed_reason IS NOT NULL))[1],
         count(*)::bigint,
         CASE WHEN (SELECT n FROM t) > 0
              THEN round(count(*) * 100.0 / (SELECT n FROM t), 2) ELSE 0 END
  FROM f GROUP BY f.code ORDER BY count(*) DESC
$$;

GRANT EXECUTE ON FUNCTION public.wa_campaign_failure_reasons(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_suppression_is_active(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_suppression_add(text,text,text,boolean,integer,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_suppression_register_failure(text,text,integer,integer) TO service_role;

-- ============ 5. PRÉ-CONFERÊNCIA DA BASE ============
CREATE OR REPLACE FUNCTION public.wa_audience_preflight(_list_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH raw AS (
    SELECT regexp_replace(c.phone, '\D', '', 'g') AS phone, c.opt_in, c.opt_out
    FROM public.contact_list_items i
    JOIN public.contacts c ON c.id = i.contact_id
    WHERE i.list_id = _list_id AND c.phone IS NOT NULL
  ), valid AS (
    SELECT * FROM raw WHERE phone <> ''
  ), uniq AS (
    SELECT DISTINCT phone, bool_or(opt_in IS FALSE OR opt_out IS TRUE) AS blocked
    FROM valid GROUP BY phone
  )
  SELECT jsonb_build_object(
    'imported', (SELECT count(*) FROM raw),
    'invalid_phone', (SELECT count(*) FROM raw WHERE phone = ''),
    'duplicates_removed', (SELECT count(*) FROM valid) - (SELECT count(*) FROM uniq),
    'contact_opt_out', (SELECT count(*) FROM uniq WHERE blocked),
    'global_opt_out', (SELECT count(*) FROM uniq u
                        WHERE NOT u.blocked
                          AND EXISTS (SELECT 1 FROM public.opt_outs o
                                      WHERE regexp_replace(o.phone,'\D','','g') = u.phone)),
    'suppressed', (SELECT count(*) FROM uniq u
                    WHERE NOT u.blocked
                      AND NOT EXISTS (SELECT 1 FROM public.opt_outs o
                                      WHERE regexp_replace(o.phone,'\D','','g') = u.phone)
                      AND EXISTS (SELECT 1 FROM public.recipient_suppression s
                                  WHERE s.phone_normalized = u.phone
                                    AND (s.permanent OR s.expires_at IS NULL OR s.expires_at > now()))),
    'eligible', (SELECT count(*) FROM uniq u
                  WHERE NOT u.blocked
                    AND NOT EXISTS (SELECT 1 FROM public.opt_outs o
                                    WHERE regexp_replace(o.phone,'\D','','g') = u.phone)
                    AND NOT EXISTS (SELECT 1 FROM public.recipient_suppression s
                                    WHERE s.phone_normalized = u.phone
                                      AND (s.permanent OR s.expires_at IS NULL OR s.expires_at > now())))
  )
$$;

GRANT EXECUTE ON FUNCTION public.wa_audience_preflight(uuid) TO authenticated, service_role;

-- ============ 6. MONTAGEM COM SUPRESSÃO ============
CREATE OR REPLACE FUNCTION public.wa_build_recipients(_campaign_id uuid, _list_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.wa_split_build_recipients(_campaign_ids uuid[], _list_id uuid, _weights integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    LEFT JOIN public.opt_outs o ON o.phone = c.phone
    WHERE i.list_id = _list_id
      AND c.phone IS NOT NULL
      AND c.opt_in IS NOT FALSE
      AND c.opt_out IS NOT TRUE
      AND o.phone IS NULL
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
END $$;

-- ============ 7. ÍNDICES DE PERFORMANCE ============
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_error
  ON public.campaign_recipients(campaign_id, error_code) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_status_created
  ON public.campaign_recipients(campaign_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opt_outs_phone ON public.opt_outs(phone);