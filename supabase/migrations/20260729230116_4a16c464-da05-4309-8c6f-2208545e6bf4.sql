SELECT
  q.id,
  q.status,
  q.attempt,
  q.last_error,
  q.scheduled_at,
  q.created_at,
  m.status AS message_status,
  m.wamid,
  m.error_code,
  m.error_message
FROM public.wa_service_queue q
LEFT JOIN public.wa_conversation_messages m ON m.id = q.message_id
JOIN public.wa_conversations c ON c.id = q.conversation_id
WHERE c.campaign_id='a64c8645-9168-409a-83a5-c179677aa144'
  AND q.origin='auto_flow'
ORDER BY q.created_at DESC
LIMIT 5;