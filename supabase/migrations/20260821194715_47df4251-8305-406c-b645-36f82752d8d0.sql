WITH r AS (
  SELECT id, waba_id FROM public.whatsapp_wabas WHERE restriction_level = 'restricted'
), conns AS (
  SELECT c.id FROM public.whatsapp_connections c
  WHERE c.waba_id IN (SELECT waba_id FROM r) OR c.waba_ref_id IN (SELECT id FROM r)
)
UPDATE public.wa_campaigns k
SET template_id = NULL
WHERE k.template_id IN (
  SELECT t.id FROM public.whatsapp_templates t
  WHERE t.connection_id IN (SELECT id FROM conns) OR t.waba_ref_id IN (SELECT id FROM r)
);

WITH r AS (
  SELECT id, waba_id FROM public.whatsapp_wabas WHERE restriction_level = 'restricted'
), del_conn AS (
  DELETE FROM public.whatsapp_connections c
  WHERE c.waba_id IN (SELECT waba_id FROM r) OR c.waba_ref_id IN (SELECT id FROM r)
  RETURNING 1
)
DELETE FROM public.whatsapp_wabas w WHERE w.id IN (SELECT id FROM r);