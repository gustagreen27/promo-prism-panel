ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_slug_key ON public.profiles (login_slug) WHERE login_slug IS NOT NULL;