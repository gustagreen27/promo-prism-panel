
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;
UPDATE public.reports SET generated_at = created_at WHERE generated_at IS NULL;
