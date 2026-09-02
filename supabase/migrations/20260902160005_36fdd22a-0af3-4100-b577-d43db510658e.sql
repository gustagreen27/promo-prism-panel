CREATE OR REPLACE FUNCTION public.wa_import_phones_chunk(
  _list_id uuid,
  _ws uuid,
  _rows jsonb,
  _source text DEFAULT 'painel'::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '300s'
AS $function$
DECLARE
  v_total integer := 0;
BEGIN
  IF NOT (public.is_workspace_member(_ws, auth.uid()) OR public.is_internal_staff(auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contact_lists l
    WHERE l.id = _list_id
      AND l.workspace_id = _ws
  ) THEN
    RAISE EXCEPTION 'LIST_NOT_IN_WORKSPACE';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.wa_import_chunk_rows (
    phone text PRIMARY KEY,
    name text
  ) ON COMMIT DROP;

  TRUNCATE pg_temp.wa_import_chunk_rows;

  INSERT INTO pg_temp.wa_import_chunk_rows (phone, name)
  SELECT DISTINCT ON (phone)
    phone,
    name
  FROM (
    SELECT
      NULLIF(trim(r->>'phone'), '') AS phone,
      NULLIF(trim(r->>'name'), '') AS name
    FROM jsonb_array_elements(_rows) AS r
  ) parsed
  WHERE phone IS NOT NULL
  ORDER BY phone;

  INSERT INTO public.contacts (
    phone,
    name,
    workspace_id,
    client_id,
    source,
    opt_in,
    opt_in_at
  )
  SELECT
    src.phone,
    src.name,
    _ws,
    NULL,
    _source,
    true,
    now()
  FROM pg_temp.wa_import_chunk_rows src
  ON CONFLICT (
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    phone,
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) DO NOTHING;

  WITH linked AS (
    INSERT INTO public.contact_list_items (list_id, contact_id, workspace_id)
    SELECT
      _list_id,
      c.id,
      _ws
    FROM pg_temp.wa_import_chunk_rows src
    JOIN public.contacts c
      ON c.workspace_id = _ws
     AND c.client_id IS NULL
     AND c.phone = src.phone
    ON CONFLICT (list_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_total FROM linked;

  RETURN v_total;
END;
$function$;