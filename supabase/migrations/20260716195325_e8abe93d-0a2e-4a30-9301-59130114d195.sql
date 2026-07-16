CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status_next_created
ON public.campaign_recipients (campaign_id, status, next_attempt_at NULLS FIRST, created_at)
INCLUDE (phone, contact_id, attempt)
WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status_sent_desc
ON public.campaign_recipients (campaign_id, status, sent_at DESC NULLS LAST)
INCLUDE (phone, contact_id, delivered_at, read_at, replied_at, failed_at, failed_reason, error_code, meta_message_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_processing_stale
ON public.campaign_recipients (campaign_id, last_attempt_at)
WHERE status = 'processing' AND meta_message_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_lookup
ON public.contacts (phone)
INCLUDE (id, name, email, metadata, client_id, project_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_opt_outs_phone_lookup
ON public.opt_outs (phone)
INCLUDE (id, client_id, workspace_id);