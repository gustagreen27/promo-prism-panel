-- lovable-cron-fallback-reviewed: timed waits need a 1-min backstop; job exists only while pending work exists and unschedules itself when idle; replies/manual runs are processed inline
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  trigger_type text,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  draft_graph jsonb NOT NULL DEFAULT '{"schema":1,"nodes":[],"edges":[]}'::jsonb,
  draft_updated_at timestamptz NOT NULL DEFAULT now(),
  published_version_id uuid,
  webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  schedule_fired_at timestamptz,
  runs_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  graph jsonb NOT NULL,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, version)
);
ALTER TABLE public.automations ADD CONSTRAINT automations_published_version_fk FOREIGN KEY (published_version_id) REFERENCES public.automation_versions(id) ON DELETE SET NULL;

CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.automation_versions(id) ON DELETE CASCADE,
  workspace_id uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_phone text,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  trigger_type text NOT NULL,
  trigger_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','waiting','completed','failed','cancelled')),
  current_node_id text,
  path text[] NOT NULL DEFAULT '{}',
  is_test boolean NOT NULL DEFAULT false,
  simulate boolean NOT NULL DEFAULT false,
  dedup_key text UNIQUE,
  error text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_runs_automation ON public.automation_runs(automation_id, started_at DESC);

CREATE TABLE public.automation_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','waiting','skipped','uncertain','simulated')),
  attempt integer NOT NULL DEFAULT 1,
  output_handle text,
  input jsonb,
  output jsonb,
  error text,
  wamid text,
  delivery_status text,
  delivery_updated_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX idx_automation_steps_run ON public.automation_run_steps(run_id, started_at);
CREATE UNIQUE INDEX uq_automation_steps_wamid ON public.automation_run_steps(wamid) WHERE wamid IS NOT NULL;

CREATE TABLE public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  kind text NOT NULL DEFAULT 'step' CHECK (kind IN ('step','wait_timeout')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','cancelled')),
  run_at timestamptz NOT NULL DEFAULT now(),
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_jobs_due ON public.automation_jobs(run_at) WHERE status = 'pending';

CREATE TABLE public.automation_waits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  connection_id uuid,
  contact_phone text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','replied','timed_out','cancelled','superseded')),
  expires_at timestamptz NOT NULL,
  reply jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_automation_wait_active ON public.automation_waits(COALESCE(connection_id,'00000000-0000-0000-0000-000000000000'::uuid), contact_phone) WHERE status = 'waiting';

CREATE TABLE public.automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  workspace_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX idx_automation_events_pending ON public.automation_events(received_at) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations, public.automation_versions, public.automation_runs, public.automation_run_steps, public.automation_jobs, public.automation_waits, public.automation_events TO authenticated;
GRANT ALL ON public.automations, public.automation_versions, public.automation_runs, public.automation_run_steps, public.automation_jobs, public.automation_waits, public.automation_events TO service_role;

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_waits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff all automations" ON public.automations FOR ALL TO authenticated USING (public.is_internal_staff(auth.uid())) WITH CHECK (public.is_internal_staff(auth.uid()));
CREATE POLICY "staff read versions" ON public.automation_versions FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
CREATE POLICY "staff read runs" ON public.automation_runs FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
CREATE POLICY "staff read steps" ON public.automation_run_steps FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
CREATE POLICY "staff read jobs" ON public.automation_jobs FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
CREATE POLICY "staff read waits" ON public.automation_waits FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
CREATE POLICY "staff read events" ON public.automation_events FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.automation_claim_jobs(_holder text, _limit integer DEFAULT 20)
RETURNS SETOF public.automation_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.automation_jobs SET status='pending', locked_at=NULL, locked_by=NULL, updated_at=now()
   WHERE status='running' AND locked_at < now() - interval '2 minutes';
  RETURN QUERY
  UPDATE public.automation_jobs j SET status='running', locked_at=now(), locked_by=_holder, attempt=j.attempt+1, updated_at=now()
   WHERE j.id IN (
     SELECT id FROM public.automation_jobs
      WHERE status='pending' AND run_at <= now()
      ORDER BY run_at
      LIMIT _limit
      FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION public.automation_resolve_wait(_wait_id uuid, _outcome text, _reply jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.automation_waits SET status=_outcome, reply=_reply, resolved_at=now()
   WHERE id=_wait_id AND status='waiting';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

CREATE OR REPLACE FUNCTION public.automation_tick_start() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-tick') THEN
    PERFORM cron.schedule('automation-tick', '* * * * *', $job$
      SELECT net.http_post(
        url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/hooks/automation-tick',
        headers := public.cron_headers('cron-automation-1min'),
        body := '{}'::jsonb);
    $job$);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.automation_tick_stop_if_idle() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.automation_jobs WHERE status IN ('pending','running'))
     OR EXISTS (SELECT 1 FROM public.automation_events WHERE status = 'pending')
     OR EXISTS (SELECT 1 FROM public.automations WHERE status='active' AND trigger_type='scheduled' AND schedule_fired_at IS NULL) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-tick') THEN
    PERFORM cron.unschedule('automation-tick');
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.trg_automation_wake() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.automation_tick_start();
  RETURN NULL;
END $$;
CREATE TRIGGER automation_jobs_wake AFTER INSERT ON public.automation_jobs FOR EACH STATEMENT EXECUTE FUNCTION public.trg_automation_wake();
CREATE TRIGGER automation_events_wake AFTER INSERT ON public.automation_events FOR EACH STATEMENT EXECUTE FUNCTION public.trg_automation_wake();

REVOKE EXECUTE ON FUNCTION public.automation_claim_jobs(text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_resolve_wait(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_tick_start() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_tick_stop_if_idle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_claim_jobs(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.automation_resolve_wait(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.automation_tick_start() TO service_role;
GRANT EXECUTE ON FUNCTION public.automation_tick_stop_if_idle() TO service_role;

CREATE OR REPLACE FUNCTION public.trg_automation_contact_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.automations WHERE status='active' AND trigger_type='contact_created') THEN
    INSERT INTO public.automation_events(event_type, dedup_key, workspace_id, payload)
    VALUES ('contact_created', 'contact_created:'||NEW.id, NEW.workspace_id, jsonb_build_object('contact_id', NEW.id))
    ON CONFLICT (dedup_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER automation_contact_created AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trg_automation_contact_created();

CREATE OR REPLACE FUNCTION public.trg_automation_tag_added() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.automations WHERE status='active' AND trigger_type='tag_added') THEN
    INSERT INTO public.automation_events(event_type, dedup_key, workspace_id, payload)
    VALUES ('tag_added', 'tag_added:'||NEW.contact_id||':'||NEW.tag_id||':'||txid_current(), NEW.workspace_id,
            jsonb_build_object('contact_id', NEW.contact_id, 'tag_id', NEW.tag_id))
    ON CONFLICT (dedup_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER automation_tag_added AFTER INSERT ON public.contact_tag_assignments FOR EACH ROW EXECUTE FUNCTION public.trg_automation_tag_added();

CREATE TRIGGER automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();