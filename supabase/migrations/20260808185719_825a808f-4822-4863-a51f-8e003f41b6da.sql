CREATE TABLE IF NOT EXISTS public.ip_geo_cache (
  ip text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ip_geo_cache TO service_role;
ALTER TABLE public.ip_geo_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ip_geo_cache_updated_at_idx ON public.ip_geo_cache (updated_at);