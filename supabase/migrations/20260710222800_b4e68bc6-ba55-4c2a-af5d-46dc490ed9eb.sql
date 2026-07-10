
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.wa_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_events_workspace_idx ON public.calendar_events(workspace_id, start_time);
CREATE INDEX IF NOT EXISTS calendar_events_campaign_idx ON public.calendar_events(campaign_id);
