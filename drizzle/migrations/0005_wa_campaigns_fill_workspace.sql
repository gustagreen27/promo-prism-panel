CREATE OR REPLACE FUNCTION public.wa_campaigns_fill_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.list_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.contact_lists WHERE id = NEW.list_id;
  END IF;
  IF NEW.workspace_id IS NULL AND NEW.connection_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.whatsapp_connections WHERE id = NEW.connection_id;
  END IF;
  IF NEW.workspace_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.clients WHERE id = NEW.client_id;
  END IF;
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := '2156c069-7c38-4e35-bfa2-39500f542f6d'::uuid; -- Legacy — Interno
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_wa_campaigns_fill_workspace ON public.wa_campaigns;
CREATE TRIGGER trg_wa_campaigns_fill_workspace BEFORE INSERT ON public.wa_campaigns
FOR EACH ROW EXECUTE FUNCTION public.wa_campaigns_fill_workspace();