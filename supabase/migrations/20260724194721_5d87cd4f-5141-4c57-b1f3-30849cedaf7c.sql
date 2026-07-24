
-- Phase 4: Attendance automation & SLA

-- 1) Settings per workspace
CREATE TABLE IF NOT EXISTS public.wa_attendance_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  round_robin_enabled boolean NOT NULL DEFAULT false,
  agent_roles workspace_role[] NOT NULL DEFAULT ARRAY['owner','admin','operator']::workspace_role[],
  sla_first_response_minutes integer NOT NULL DEFAULT 15 CHECK (sla_first_response_minutes > 0),
  keyword_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  notify_on_new_conversation boolean NOT NULL DEFAULT true,
  notify_on_sla_breach boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_attendance_settings TO authenticated;
GRANT ALL ON public.wa_attendance_settings TO service_role;
ALTER TABLE public.wa_attendance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_settings_read"
  ON public.wa_attendance_settings FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE POLICY "attendance_settings_write"
  ON public.wa_attendance_settings FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]) OR public.is_internal_staff(auth.uid()));

CREATE TRIGGER wa_attendance_settings_updated_at
  BEFORE UPDATE ON public.wa_attendance_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) SLA / assignment columns on conversations
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_first_response_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS sla_first_response_breached_at timestamptz;

CREATE INDEX IF NOT EXISTS wa_conversations_sla_open_idx
  ON public.wa_conversations (workspace_id, sla_first_response_deadline)
  WHERE first_response_at IS NULL AND sla_first_response_breached_at IS NULL;

-- 3) Round-robin pick: least recently assigned member with allowed role
CREATE OR REPLACE FUNCTION public.wa_pick_next_agent(_ws uuid, _roles workspace_role[])
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wm.user_id
  FROM public.workspace_members wm
  LEFT JOIN LATERAL (
    SELECT MAX(assigned_at) AS last_at
    FROM public.wa_conversations c
    WHERE c.workspace_id = _ws AND c.assigned_user_id = wm.user_id
  ) la ON true
  WHERE wm.workspace_id = _ws
    AND wm.role = ANY(_roles)
  ORDER BY la.last_at ASC NULLS FIRST, wm.created_at ASC
  LIMIT 1;
$$;

-- 4) Automation trigger on inbound / outbound conversation messages
CREATE OR REPLACE FUNCTION public.trg_wa_attendance_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.wa_conversations%ROWTYPE;
  v_settings public.wa_attendance_settings%ROWTYPE;
  v_agent uuid;
  v_new_tags text[];
  v_rule jsonb;
  v_pattern text;
  v_added text[] := ARRAY[]::text[];
  v_forced_assignee uuid;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_conv FROM public.wa_conversations WHERE id = NEW.conversation_id;
  IF v_conv.id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_settings FROM public.wa_attendance_settings
    WHERE workspace_id = v_conv.workspace_id;

  IF NEW.direction = 'inbound' THEN
    -- Keyword rules → tags + optional forced assignee
    IF v_settings.keyword_rules IS NOT NULL AND jsonb_array_length(v_settings.keyword_rules) > 0
       AND COALESCE(NEW.body, '') <> '' THEN
      FOR v_rule IN SELECT * FROM jsonb_array_elements(v_settings.keyword_rules)
      LOOP
        v_pattern := v_rule->>'pattern';
        IF v_pattern IS NOT NULL AND NEW.body ~* v_pattern THEN
          IF v_rule ? 'tags' THEN
            SELECT array_agg(t) INTO v_new_tags
              FROM jsonb_array_elements_text(v_rule->'tags') AS t;
            IF v_new_tags IS NOT NULL THEN
              v_added := v_added || v_new_tags;
            END IF;
          END IF;
          IF v_forced_assignee IS NULL AND (v_rule->>'assign_to') IS NOT NULL THEN
            v_forced_assignee := NULLIF(v_rule->>'assign_to','')::uuid;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Auto-assign
    IF v_conv.assigned_user_id IS NULL THEN
      IF v_forced_assignee IS NOT NULL THEN
        UPDATE public.wa_conversations
          SET assigned_user_id = v_forced_assignee, assigned_at = now(), updated_at = now()
          WHERE id = v_conv.id;
        v_conv.assigned_user_id := v_forced_assignee;
      ELSIF COALESCE(v_settings.round_robin_enabled, false) THEN
        v_agent := public.wa_pick_next_agent(v_conv.workspace_id,
          COALESCE(v_settings.agent_roles, ARRAY['owner','admin','operator']::workspace_role[]));
        IF v_agent IS NOT NULL THEN
          UPDATE public.wa_conversations
            SET assigned_user_id = v_agent, assigned_at = now(), updated_at = now()
            WHERE id = v_conv.id;
          v_conv.assigned_user_id := v_agent;
        END IF;
      END IF;
    END IF;

    -- Apply tags (dedup)
    IF array_length(v_added, 1) > 0 THEN
      UPDATE public.wa_conversations
        SET tags = ARRAY(SELECT DISTINCT unnest(tags || v_added)),
            updated_at = now()
        WHERE id = v_conv.id;
    END IF;

    -- SLA deadline: set when there is no first response yet and no deadline
    IF v_conv.first_response_at IS NULL AND v_conv.sla_first_response_deadline IS NULL THEN
      v_deadline := now() + make_interval(mins => COALESCE(v_settings.sla_first_response_minutes, 15));
      UPDATE public.wa_conversations
        SET sla_first_response_deadline = v_deadline, updated_at = now()
        WHERE id = v_conv.id;
    END IF;

    -- Notify (only on the very first inbound of a conversation)
    IF COALESCE(v_settings.notify_on_new_conversation, true)
       AND v_conv.last_inbound_at IS NULL THEN
      PERFORM public.notify_workspace(
        v_conv.workspace_id, 'attendance.new',
        'Nova conversa recebida',
        'De ' || COALESCE(v_conv.contact_name, v_conv.contact_phone),
        '/admin/atendimento',
        'info',
        jsonb_build_object('conversation_id', v_conv.id)
      );
    END IF;

  ELSIF NEW.direction = 'outbound'
        AND COALESCE(NEW.origin, '') NOT IN ('auto_reply', 'system')
        AND v_conv.first_response_at IS NULL THEN
    -- First agent response resolves SLA
    UPDATE public.wa_conversations
      SET first_response_at = now(),
          sla_first_response_breached_at = CASE
            WHEN sla_first_response_deadline IS NOT NULL AND now() > sla_first_response_deadline
              THEN COALESCE(sla_first_response_breached_at, now())
            ELSE sla_first_response_breached_at
          END,
          updated_at = now()
      WHERE id = v_conv.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_attendance_automation ON public.wa_conversation_messages;
CREATE TRIGGER trg_wa_attendance_automation
  AFTER INSERT ON public.wa_conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_wa_attendance_automation();

-- 5) SLA breach sweeper (called by pg_cron once per minute)
CREATE OR REPLACE FUNCTION public.wa_sla_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT c.id, c.workspace_id, c.contact_name, c.contact_phone,
           COALESCE(s.notify_on_sla_breach, true) AS notify
    FROM public.wa_conversations c
    LEFT JOIN public.wa_attendance_settings s ON s.workspace_id = c.workspace_id
    WHERE c.first_response_at IS NULL
      AND c.sla_first_response_breached_at IS NULL
      AND c.sla_first_response_deadline IS NOT NULL
      AND c.sla_first_response_deadline < now()
    LIMIT 500
  LOOP
    UPDATE public.wa_conversations
      SET sla_first_response_breached_at = now(), updated_at = now()
      WHERE id = r.id;
    IF r.notify THEN
      PERFORM public.notify_workspace(
        r.workspace_id, 'attendance.sla_breach',
        'SLA de primeira resposta estourou',
        'Conversa com ' || COALESCE(r.contact_name, r.contact_phone) || ' aguardando atendimento.',
        '/admin/atendimento',
        'warning',
        jsonb_build_object('conversation_id', r.id)
      );
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
