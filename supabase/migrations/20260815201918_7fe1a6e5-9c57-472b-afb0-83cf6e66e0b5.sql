ALTER TABLE public.imported_dispatch_reports
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS imported_dispatch_reports_public_slug_key
  ON public.imported_dispatch_reports (public_slug) WHERE public_slug IS NOT NULL;

GRANT SELECT ON public.imported_dispatch_reports TO anon;
GRANT SELECT ON public.imported_dispatch_report_records TO anon;

DROP POLICY IF EXISTS "Public reports are viewable by anyone" ON public.imported_dispatch_reports;
CREATE POLICY "Public reports are viewable by anyone"
  ON public.imported_dispatch_reports FOR SELECT TO anon
  USING (is_public = true AND public_slug IS NOT NULL);

DROP POLICY IF EXISTS "Public report records are viewable by anyone" ON public.imported_dispatch_report_records;
CREATE POLICY "Public report records are viewable by anyone"
  ON public.imported_dispatch_report_records FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.imported_dispatch_reports r
    WHERE r.id = imported_dispatch_report_records.report_id
      AND r.is_public = true
      AND r.public_slug IS NOT NULL
  ));