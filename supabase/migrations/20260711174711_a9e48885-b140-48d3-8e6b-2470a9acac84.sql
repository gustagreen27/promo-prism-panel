ALTER TABLE public.whatsapp_connections ALTER COLUMN use_global_token SET DEFAULT true;
UPDATE public.whatsapp_connections SET use_global_token = true WHERE use_global_token IS DISTINCT FROM true;