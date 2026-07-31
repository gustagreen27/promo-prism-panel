UPDATE public.whatsapp_connections c
SET waba_ref_id = w.id
FROM public.whatsapp_wabas w
WHERE c.waba_id = w.waba_id AND c.waba_ref_id IS NULL;

UPDATE public.whatsapp_wabas w
SET access_token = c.access_token
FROM public.whatsapp_connections c
WHERE c.waba_ref_id = w.id AND w.access_token IS NULL AND c.access_token IS NOT NULL;