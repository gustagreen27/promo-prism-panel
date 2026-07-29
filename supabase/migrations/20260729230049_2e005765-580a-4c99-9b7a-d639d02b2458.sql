SELECT
  (SELECT count(*) FROM public.wa_conversations WHERE campaign_id='a64c8645-9168-409a-83a5-c179677aa144') AS linked_conversations,
  (SELECT count(*) FROM public.wa_conversation_messages m JOIN public.wa_conversations c ON c.id=m.conversation_id WHERE c.campaign_id='a64c8645-9168-409a-83a5-c179677aa144' AND m.origin='auto_flow') AS auto_flow_messages,
  (SELECT count(*) FROM public.wa_service_queue q JOIN public.wa_conversations c ON c.id=q.conversation_id WHERE c.campaign_id='a64c8645-9168-409a-83a5-c179677aa144' AND q.origin='auto_flow') AS auto_flow_queue_items;