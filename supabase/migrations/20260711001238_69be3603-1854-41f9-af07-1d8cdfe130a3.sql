
CREATE OR REPLACE FUNCTION public.backfill_contact_workspace_ids()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_ws uuid;
  v_lists int := 0;
  v_items int := 0;
  v_contacts int := 0;
BEGIN
  SELECT id INTO v_default_ws
  FROM public.workspaces
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_ws IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_workspace');
  END IF;

  -- Contacts órfãos → workspace padrão
  WITH upd AS (
    UPDATE public.contacts SET workspace_id = v_default_ws
    WHERE workspace_id IS NULL
    RETURNING 1
  ) SELECT count(*) INTO v_contacts FROM upd;

  -- Listas órfãs → workspace padrão
  WITH upd AS (
    UPDATE public.contact_lists SET workspace_id = v_default_ws
    WHERE workspace_id IS NULL
    RETURNING 1
  ) SELECT count(*) INTO v_lists FROM upd;

  -- Itens da lista → herda do contato ou da lista
  WITH upd AS (
    UPDATE public.contact_list_items i
    SET workspace_id = COALESCE(c.workspace_id, l.workspace_id, v_default_ws)
    FROM public.contacts c, public.contact_lists l
    WHERE i.workspace_id IS NULL
      AND c.id = i.contact_id
      AND l.id = i.list_id
    RETURNING 1
  ) SELECT count(*) INTO v_items FROM upd;

  RETURN jsonb_build_object(
    'ok', true,
    'default_workspace_id', v_default_ws,
    'contacts_updated', v_contacts,
    'contact_lists_updated', v_lists,
    'contact_list_items_updated', v_items
  );
END $$;

REVOKE ALL ON FUNCTION public.backfill_contact_workspace_ids() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_contact_workspace_ids() TO service_role;

-- Executa imediatamente para regularizar dados antigos
SELECT public.backfill_contact_workspace_ids();
