ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS parallelism integer,
  ADD COLUMN IF NOT EXISTS batch_pause_ms integer;

COMMENT ON COLUMN public.wa_campaigns.parallelism IS 'Quantas mensagens são disparadas em paralelo dentro de um tick do worker (default 40).';
COMMENT ON COLUMN public.wa_campaigns.batch_pause_ms IS 'Pausa em ms entre sub-lotes paralelos dentro de um tick (default 1500).';