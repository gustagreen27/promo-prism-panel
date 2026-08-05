ALTER TABLE public.whatsapp_connections ALTER COLUMN global_rate_per_second SET DEFAULT 80;
ALTER TABLE public.whatsapp_connections ALTER COLUMN global_max_concurrency SET DEFAULT 800;
UPDATE public.whatsapp_connections
SET global_rate_per_second = GREATEST(COALESCE(global_rate_per_second,0), LEAST(COALESCE(maximum_rate_per_second,80), 80)),
    maximum_rate_per_second = GREATEST(COALESCE(maximum_rate_per_second,80), 80),
    global_max_concurrency = GREATEST(COALESCE(global_max_concurrency,0), 800)
WHERE COALESCE(global_rate_per_second,0) < 80 OR COALESCE(global_max_concurrency,0) < 800;