-- Billing settings: only internal staff read the table; everyone signed in gets the safe pricing fields via a function
CREATE OR REPLACE FUNCTION public.get_billing_settings()
RETURNS TABLE(id smallint, default_price_cents integer, minimum_deposit_cents integer, default_minimum_messages integer, currency text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.default_price_cents, b.minimum_deposit_cents, b.default_minimum_messages, b.currency
  FROM public.billing_settings b
  WHERE b.id = 1 AND auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.get_billing_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_settings() TO authenticated, service_role;

DROP POLICY IF EXISTS authenticated_read_billing_settings ON public.billing_settings;
CREATE POLICY staff_read_billing_settings ON public.billing_settings
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

-- Platform capacity: only internal staff read the full row (internal note, automation settings);
-- signed-in clients get just the public counters via a function
CREATE OR REPLACE FUNCTION public.get_platform_capacity_public()
RETURNS TABLE(daily_capacity bigint, daily_completed bigint, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.daily_capacity, c.daily_completed, c.updated_at
  FROM public.platform_capacity c
  WHERE auth.uid() IS NOT NULL
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_platform_capacity_public() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_capacity_public() TO authenticated, service_role;

DROP POLICY IF EXISTS capacity_read_all_authenticated ON public.platform_capacity;
CREATE POLICY capacity_staff_read ON public.platform_capacity
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

-- Template media bucket: internal staff only, each person manages the files they uploaded
DROP POLICY IF EXISTS template_media_read ON storage.objects;
DROP POLICY IF EXISTS template_media_insert ON storage.objects;
DROP POLICY IF EXISTS template_media_update ON storage.objects;
DROP POLICY IF EXISTS template_media_delete ON storage.objects;

CREATE POLICY template_media_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'template-media' AND public.is_internal_staff(auth.uid()) AND owner_id = (select auth.uid()::text));

CREATE POLICY template_media_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'template-media' AND public.is_internal_staff(auth.uid()) AND owner_id = (select auth.uid()::text));

CREATE POLICY template_media_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'template-media' AND public.is_internal_staff(auth.uid()) AND owner_id = (select auth.uid()::text))
  WITH CHECK (bucket_id = 'template-media' AND public.is_internal_staff(auth.uid()) AND owner_id = (select auth.uid()::text));

CREATE POLICY template_media_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'template-media' AND public.is_internal_staff(auth.uid()) AND owner_id = (select auth.uid()::text));