CREATE OR REPLACE FUNCTION public.campaign_audit_fill_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.campaign_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.wa_campaigns WHERE id = NEW.campaign_id;
  END IF;
  IF NEW.workspace_id IS NULL AND NEW.actor_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.workspace_members WHERE user_id = NEW.actor_id ORDER BY created_at LIMIT 1;
  END IF;
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := '2156c069-7c38-4e35-bfa2-39500f542f6d'::uuid;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campaign_audit_fill_workspace ON public.campaign_audit_log;
CREATE TRIGGER trg_campaign_audit_fill_workspace BEFORE INSERT ON public.campaign_audit_log
FOR EACH ROW EXECUTE FUNCTION public.campaign_audit_fill_workspace();
DROP TRIGGER IF EXISTS trg_wa_campaigns_fill_workspace ON public.wa_campaigns;
CREATE TRIGGER trg_wa_campaigns_fill_workspace BEFORE INSERT OR UPDATE ON public.wa_campaigns
FOR EACH ROW EXECUTE FUNCTION public.wa_campaigns_fill_workspace();