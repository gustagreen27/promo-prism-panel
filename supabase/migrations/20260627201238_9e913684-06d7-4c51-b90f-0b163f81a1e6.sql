
DO $$ BEGIN
  CREATE TYPE public.partner_participant AS ENUM ('gustavo','cayo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaigns         ADD COLUMN IF NOT EXISTS participants public.partner_participant[] NOT NULL DEFAULT '{}';
ALTER TABLE public.wa_campaigns      ADD COLUMN IF NOT EXISTS participants public.partner_participant[] NOT NULL DEFAULT '{}';
ALTER TABLE public.revenues          ADD COLUMN IF NOT EXISTS participants public.partner_participant[] NOT NULL DEFAULT '{}';
ALTER TABLE public.costs             ADD COLUMN IF NOT EXISTS participants public.partner_participant[] NOT NULL DEFAULT '{}';
ALTER TABLE public.closings          ADD COLUMN IF NOT EXISTS participants public.partner_participant[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_campaigns_participants    ON public.campaigns    USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_participants ON public.wa_campaigns USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_revenues_participants     ON public.revenues     USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_costs_participants        ON public.costs        USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_closings_participants     ON public.closings     USING GIN (participants);
