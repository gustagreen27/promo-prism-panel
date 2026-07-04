
-- ============ 1. PROFILES: extra fields ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ensure profiles has RLS + policies for self-management
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_self_select') THEN
    CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_internal_staff(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_self_update') THEN
    CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- ============ 2. ACTIVITY_LOGS: metadata jsonb ============
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ 3. ONBOARDING CHECKLIST ============
CREATE TABLE IF NOT EXISTS public.onboarding_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_checklist TO authenticated;
GRANT ALL ON public.onboarding_checklist TO service_role;
ALTER TABLE public.onboarding_checklist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='onboarding_checklist' AND policyname='ob_ws_read') THEN
    CREATE POLICY ob_ws_read ON public.onboarding_checklist FOR SELECT TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='onboarding_checklist' AND policyname='ob_ws_write') THEN
    CREATE POLICY ob_ws_write ON public.onboarding_checklist FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));
  END IF;
END $$;

CREATE TRIGGER onboarding_checklist_updated_at
  BEFORE UPDATE ON public.onboarding_checklist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper to seed default checklist for a workspace
CREATE OR REPLACE FUNCTION public.seed_onboarding_checklist(_ws uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.onboarding_checklist(workspace_id, key)
  VALUES (_ws,'company_profile'),(_ws,'import_contacts'),(_ws,'request_template'),(_ws,'add_balance'),(_ws,'first_campaign')
  ON CONFLICT DO NOTHING;
$$;

-- Backfill for existing workspaces
INSERT INTO public.onboarding_checklist(workspace_id, key)
SELECT w.id, k.key
FROM public.workspaces w
CROSS JOIN (VALUES ('company_profile'),('import_contacts'),('request_template'),('add_balance'),('first_campaign')) AS k(key)
ON CONFLICT DO NOTHING;

-- ============ 4. Rewrite handle_new_user ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name text;
  v_phone     text;
  v_cnpj      text;
  v_company   text;
  v_slug      text;
  v_ws_id     uuid;
BEGIN
  v_full_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name','')), '');
  v_phone     := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone','')), '');
  v_cnpj      := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'cnpj','')), '');
  v_company   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name','')), '');

  INSERT INTO public.profiles (id, email, full_name, phone, cnpj)
  VALUES (NEW.id, NEW.email, v_full_name, v_phone, v_cnpj)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    cnpj = COALESCE(EXCLUDED.cnpj, public.profiles.cnpj);

  -- Skip workspace creation if user already has one
  IF EXISTS(SELECT 1 FROM public.workspace_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Always create a workspace: use company name or derive from email
  IF v_company IS NULL THEN
    v_company := COALESCE(v_full_name, split_part(NEW.email,'@',1)) || ' Workspace';
  END IF;

  v_slug := regexp_replace(lower(v_company), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  IF v_slug IS NULL OR v_slug = '' THEN v_slug := 'ws-' || substr(NEW.id::text, 1, 8); END IF;
  IF EXISTS(SELECT 1 FROM public.workspaces WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(NEW.id::text, 1, 6);
  END IF;

  INSERT INTO public.workspaces (name, slug, plan, status, owner_id)
  VALUES (v_company, v_slug, 'starter', 'active', NEW.id)
  RETURNING id INTO v_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws_id, NEW.id, 'owner'::public.workspace_role)
  ON CONFLICT DO NOTHING;

  -- Wallet is created by existing ensure_workspace_wallet trigger
  PERFORM public.seed_onboarding_checklist(v_ws_id);

  RETURN NEW;
END;
$$;

-- Ensure trigger exists on auth.users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ============ 5. log_auth_event ============
CREATE OR REPLACE FUNCTION public.log_auth_event(_type text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.activity_logs(user_id, module, action, description, metadata)
  VALUES (auth.uid(), 'auth', _type, _type, COALESCE(_metadata,'{}'::jsonb));
END $$;

-- Allow authenticated + anon (for login_failed before session exists)
GRANT EXECUTE ON FUNCTION public.log_auth_event(text, jsonb) TO authenticated, anon;

-- ============ 6. get_my_context ============
CREATE OR REPLACE FUNCTION public.get_my_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('authenticated', false); END IF;

  SELECT jsonb_build_object(
    'authenticated', true,
    'user_id', v_uid,
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid),
    'roles', COALESCE((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id = v_uid), '[]'::jsonb),
    'is_staff', public.is_internal_staff(v_uid),
    'workspaces', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'slug', w.slug, 'plan', w.plan,
        'status', w.status, 'blocked_at', w.blocked_at, 'block_reason', w.block_reason,
        'role', wm.role
      ) ORDER BY w.created_at ASC)
      FROM public.workspace_members wm JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = v_uid
    ), '[]'::jsonb),
    'primary_workspace', (
      SELECT jsonb_build_object(
        'id', w.id, 'name', w.name, 'slug', w.slug, 'plan', w.plan, 'status', w.status,
        'blocked_at', w.blocked_at, 'block_reason', w.block_reason, 'role', wm.role,
        'is_blocked', (w.blocked_at IS NOT NULL),
        'wallet', (SELECT to_jsonb(ww) FROM public.workspace_wallets ww WHERE ww.workspace_id = w.id),
        'onboarding', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('key', key, 'done', done, 'done_at', done_at) ORDER BY key)
          FROM public.onboarding_checklist WHERE workspace_id = w.id
        ), '[]'::jsonb)
      )
      FROM public.workspace_members wm JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = v_uid ORDER BY w.created_at ASC LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_context() TO authenticated;
