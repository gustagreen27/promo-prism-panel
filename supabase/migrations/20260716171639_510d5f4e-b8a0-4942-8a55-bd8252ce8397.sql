
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS app_id text,
  ADD COLUMN IF NOT EXISTS app_secret text;

COMMENT ON COLUMN public.whatsapp_connections.app_id IS 'Meta App ID específico desta conexão (opcional). Quando presente, tem prioridade sobre META_APP_ID global.';
COMMENT ON COLUMN public.whatsapp_connections.app_secret IS 'Meta App Secret específico desta conexão (opcional). Usado para validar assinaturas de webhook e para debug_token.';
