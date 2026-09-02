REVOKE ALL ON FUNCTION public.wa_import_phones_chunk(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wa_import_phones_chunk(uuid, uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.wa_import_phones_chunk(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_import_phones_chunk(uuid, uuid, jsonb, text) TO service_role;