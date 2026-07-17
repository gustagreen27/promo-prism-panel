-- Colunas de timing granular para medir pacing real, independente de latência de gravação de sent_at.
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS permit_granted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS request_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS response_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedup_key            text;

-- Índice para análise de pacing por request_started_at (fonte de verdade do intervalo real).
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_request_started
  ON public.campaign_recipients (campaign_id, request_started_at)
  WHERE request_started_at IS NOT NULL;

-- Deduplicação server-side por biz_opaque_callback_data: recipient_id nunca reenvia com sucesso 2 vezes.
-- Índice único parcial: só considera linhas onde chegou uma resposta (dedup_key preenchido pelo scheduler apenas após aceitar da Meta).
-- Com isso, mesmo se a Meta aceitar e a conexão cair antes de gravar wamid, o retry no mesmo recipient reencaminha
-- o mesmo biz_opaque_callback_data e a Meta trata como idempotente na janela deles.
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipients_dedup_key
  ON public.campaign_recipients (campaign_id, dedup_key)
  WHERE dedup_key IS NOT NULL;