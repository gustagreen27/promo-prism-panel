
REVOKE EXECUTE ON FUNCTION public.wa_consume_stock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wa_available_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_consume_stock(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_available_stock(uuid, uuid) TO service_role;
