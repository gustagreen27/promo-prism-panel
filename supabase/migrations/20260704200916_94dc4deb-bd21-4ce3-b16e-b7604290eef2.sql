
-- Enum workspace_role
DO $$ BEGIN
  CREATE TYPE public.workspace_role AS ENUM ('owner','admin','operator','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  plan text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- workspace_members
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws   ON public.workspace_members(workspace_id);

-- helpers
CREATE OR REPLACE FUNCTION public.is_workspace_member(_ws uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=_ws AND user_id=_user);
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_ws uuid, _user uuid, _roles public.workspace_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=_ws AND user_id=_user AND role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.is_internal_staff(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id=_user AND role::text IN ('admin','super_admin','support','finance','operations')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_workspace_ids(_user uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id=_user;
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid,uuid,public.workspace_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_internal_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_workspace_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid,uuid,public.workspace_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_workspace_ids(uuid) TO authenticated;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- policies workspaces
DROP POLICY IF EXISTS "members read own workspace" ON public.workspaces;
CREATE POLICY "members read own workspace" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "owners update own workspace" ON public.workspaces;
CREATE POLICY "owners update own workspace" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated create workspace" ON public.workspaces;
CREATE POLICY "authenticated create workspace" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "internal delete workspace" ON public.workspaces;
CREATE POLICY "internal delete workspace" ON public.workspaces
  FOR DELETE TO authenticated
  USING (public.is_internal_staff(auth.uid()));

-- policies workspace_members
DROP POLICY IF EXISTS "members read memberships" ON public.workspace_members;
CREATE POLICY "members read memberships" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "owners manage memberships" ON public.workspace_members;
CREATE POLICY "owners manage memberships" ON public.workspace_members
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) OR public.is_internal_staff(auth.uid()));

-- Adicionar workspace_id às tabelas operacionais
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contacts','contact_lists','contact_list_items','contact_tags','contact_tag_assignments',
    'campaigns','campaign_recipients','campaign_events','campaign_timeline','campaign_clicks',
    'wa_campaigns','whatsapp_wabas','whatsapp_connections','whatsapp_templates',
    'message_stock','message_logs','opt_outs','whatsapp_inbox','whatsapp_messages',
    'reports','import_jobs','clients','projects'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (workspace_id)', 'idx_'||t||'_workspace', t);
  END LOOP;
END $$;

-- Backfill: workspace Legacy + promover admins + associar dados
DO $$
DECLARE
  legacy_id uuid;
  first_admin uuid;
  t text;
BEGIN
  SELECT id INTO legacy_id FROM public.workspaces WHERE slug = 'legacy-interno';
  IF legacy_id IS NULL THEN
    SELECT user_id INTO first_admin FROM public.user_roles WHERE role='admin' ORDER BY created_at ASC NULLS LAST LIMIT 1;
    INSERT INTO public.workspaces (name, slug, plan, status, owner_id)
    VALUES ('Legacy — Interno', 'legacy-interno', 'enterprise', 'active', first_admin)
    RETURNING id INTO legacy_id;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  SELECT user_id, 'super_admin'::public.app_role FROM public.user_roles WHERE role='admin'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT legacy_id, user_id, 'owner'::public.workspace_role FROM public.user_roles WHERE role='admin'
  ON CONFLICT DO NOTHING;

  FOREACH t IN ARRAY ARRAY[
    'contacts','contact_lists','contact_list_items','contact_tags','contact_tag_assignments',
    'campaigns','campaign_recipients','campaign_events','campaign_timeline','campaign_clicks',
    'wa_campaigns','whatsapp_wabas','whatsapp_connections','whatsapp_templates',
    'message_stock','message_logs','opt_outs','whatsapp_inbox','whatsapp_messages',
    'reports','import_jobs','clients','projects'
  ] LOOP
    EXECUTE format('UPDATE public.%I SET workspace_id = $1 WHERE workspace_id IS NULL', t) USING legacy_id;
  END LOOP;
END $$;

-- Policies de tenant (somam-se às existentes de admin interno)
DO $$
DECLARE
  t text;
  read_roles constant text := 'ARRAY[''owner'',''admin'',''operator'',''viewer'']::public.workspace_role[]';
  write_roles constant text := 'ARRAY[''owner'',''admin'',''operator'']::public.workspace_role[]';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contacts','contact_lists','contact_list_items','contact_tags','contact_tag_assignments',
    'campaigns','campaign_recipients','campaign_events','campaign_timeline','campaign_clicks',
    'wa_campaigns','whatsapp_wabas','whatsapp_connections','whatsapp_templates',
    'message_stock','message_logs','opt_outs','whatsapp_inbox','whatsapp_messages',
    'reports','import_jobs','clients','projects'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "workspace members read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "workspace members read %s" ON public.%I FOR SELECT TO authenticated USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), %s))',
      t, t, read_roles
    );
    EXECUTE format('DROP POLICY IF EXISTS "workspace members write %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "workspace members write %s" ON public.%I FOR ALL TO authenticated USING (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), %s)) WITH CHECK (workspace_id IS NOT NULL AND public.has_workspace_role(workspace_id, auth.uid(), %s))',
      t, t, write_roles, write_roles
    );
  END LOOP;
END $$;

-- handle_new_user reformulado para SaaS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company text;
  v_slug    text;
  v_ws_id   uuid;
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;

  v_company := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name','')), '');
  IF v_company IS NOT NULL THEN
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
  END IF;

  RETURN NEW;
END;
$$;
