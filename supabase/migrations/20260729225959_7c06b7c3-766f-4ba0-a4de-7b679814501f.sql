DO $$
DECLARE
  v_campaign_id uuid := 'a64c8645-9168-409a-83a5-c179677aa144';
  v_conv_id uuid;
  v_msg_id uuid;
BEGIN
  SELECT wc.id INTO v_conv_id
  FROM public.wa_conversations wc
  JOIN public.wa_campaigns c ON c.connection_id = wc.connection_id
  WHERE c.id = v_campaign_id
    AND wc.contact_phone IN ('556291301856','5562991301856')
  ORDER BY wc.updated_at DESC
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.wa_conversations wc
  SET campaign_id = c.id,
      campaign_recipient_id = cr.id,
      conversation_status = 'in_progress',
      tags = ARRAY(SELECT DISTINCT unnest(COALESCE(wc.tags, ARRAY[]::text[]) || ARRAY['lead']::text[])),
      updated_at = now()
  FROM public.wa_campaigns c
  LEFT JOIN public.campaign_recipients cr ON cr.campaign_id = c.id
    AND cr.phone IN ('556291301856','5562991301856')
  WHERE wc.id = v_conv_id
    AND c.id = v_campaign_id;

  IF EXISTS (
    SELECT 1 FROM public.wa_service_queue
    WHERE conversation_id = v_conv_id
      AND origin = 'auto_flow'
      AND created_at > now() - interval '30 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.wa_conversation_messages (
    workspace_id, conversation_id, direction, origin, message_type, body, status, payload
  )
  SELECT
    wc.workspace_id,
    wc.id,
    'outbound',
    'auto_flow',
    'interactive',
    'Olá obrigado pela resposta, então tenho uma novidade!',
    'queued',
    jsonb_build_object(
      'kind','interactive_cta_url',
      'body','Olá obrigado pela resposta, então tenho uma novidade!',
      'display_text','Abrir link',
      'url','https://disparosfr.com/daycoval2907',
      'header','Acesse',
      'footer','Acesse abaixo',
      'source','response_flow_repair'
    )
  FROM public.wa_conversations wc
  WHERE wc.id = v_conv_id
  RETURNING id INTO v_msg_id;

  INSERT INTO public.wa_service_queue (
    workspace_id, conversation_id, connection_id, phone_number_id, contact_phone,
    message_id, payload, idempotency_key, priority, origin, scheduled_at, next_attempt_at
  )
  SELECT
    wc.workspace_id,
    wc.id,
    wc.connection_id,
    wc.phone_number_id,
    wc.contact_phone,
    v_msg_id,
    jsonb_build_object(
      'kind','interactive_cta_url',
      'body','Olá obrigado pela resposta, então tenho uma novidade!',
      'display_text','Abrir link',
      'url','https://disparosfr.com/daycoval2907',
      'header','Acesse',
      'footer','Acesse abaixo',
      'source','response_flow_repair'
    ),
    'flow-repair:' || wc.id::text || ':' || v_campaign_id::text,
    2,
    'auto_flow',
    now(),
    now()
  FROM public.wa_conversations wc
  WHERE wc.id = v_conv_id;
END $$;