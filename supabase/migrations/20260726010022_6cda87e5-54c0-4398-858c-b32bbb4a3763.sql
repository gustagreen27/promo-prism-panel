ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS destination_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS destination_rotation text NOT NULL DEFAULT 'random',
  ADD COLUMN IF NOT EXISTS destination_cursor integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_destination_rotation_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_destination_rotation_check
  CHECK (destination_rotation IN ('random','sequential'));

CREATE OR REPLACE FUNCTION public.campaign_next_destination_cursor(_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v integer;
BEGIN
  UPDATE public.campaigns
     SET destination_cursor = destination_cursor + 1
   WHERE id = _campaign_id
  RETURNING destination_cursor INTO v;
  RETURN COALESCE(v, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_next_destination_cursor(uuid) TO anon, authenticated, service_role;