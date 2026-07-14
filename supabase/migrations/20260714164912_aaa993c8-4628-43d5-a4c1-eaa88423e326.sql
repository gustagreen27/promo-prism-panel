
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS linked_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_campaigns_linked_campaign_id ON public.wa_campaigns(linked_campaign_id);
