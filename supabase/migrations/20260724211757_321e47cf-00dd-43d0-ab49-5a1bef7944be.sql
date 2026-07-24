
DO $$
DECLARE
  v_ws uuid := 'b9d103f7-1d10-42a7-ac8a-a9b115070bec';
  v_conn uuid; v_pnid text; v_conv uuid; v_msg uuid;
  v_before jsonb; v_after jsonb;
  v_kinds text[] := ARRAY['text','media','interactive_buttons','interactive_list','interactive_cta_url','template','auto_reply'];
  v_kind text; v_origin text; v_msg_type text;
  v_payload jsonb; v_wamid text;
  v_fr_before timestamptz; v_fr_after timestamptz;
  v_frozen jsonb := jsonb_build_object(
    'service_window_status', 'closed',
    'service_window_opened_at', '2026-07-20T10:00:00+00:00',
    'service_window_expires_at', '2026-07-21T10:00:00+00:00',
    'last_inbound_at', '2026-07-20T10:00:00+00:00',
    'unread_count', 0,
    'conversation_status', 'open'
  );
  v_snap jsonb;
BEGIN
  SELECT id, phone_number_id INTO v_conn, v_pnid
    FROM whatsapp_connections WHERE workspace_id=v_ws AND status='active' LIMIT 1;

  DELETE FROM wa_conversations WHERE workspace_id=v_ws AND contact_phone='5599900000001';
  INSERT INTO wa_conversations(workspace_id, connection_id, phone_number_id, contact_phone, contact_name,
    service_window_status, service_window_opened_at, service_window_expires_at,
    last_inbound_at, unread_count, conversation_status)
  VALUES (v_ws, v_conn, v_pnid, '5599900000001','E2E Phase5',
    'closed','2026-07-20 10:00:00+00','2026-07-21 10:00:00+00',
    '2026-07-20 10:00:00+00', 0, 'open')
  RETURNING id INTO v_conv;

  RAISE NOTICE '=== TESTE A + G — conversa % com janela FECHADA ===', v_conv;

  FOREACH v_kind IN ARRAY v_kinds LOOP
    SELECT jsonb_build_object(
      'service_window_status', service_window_status,
      'service_window_opened_at', service_window_opened_at,
      'service_window_expires_at', service_window_expires_at,
      'last_inbound_at', last_inbound_at,
      'unread_count', unread_count,
      'conversation_status', conversation_status
    ), first_response_at
      INTO v_before, v_fr_before FROM wa_conversations WHERE id=v_conv;

    v_payload := CASE v_kind
      WHEN 'text' THEN '{"kind":"text","body":"olá"}'::jsonb
      WHEN 'media' THEN '{"kind":"media","media_type":"image","link":"https://x/i.png","caption":"c"}'::jsonb
      WHEN 'interactive_buttons' THEN '{"kind":"interactive_buttons","body":"b","buttons":[{"id":"a","title":"A"}]}'::jsonb
      WHEN 'interactive_list' THEN '{"kind":"interactive_list","body":"b","button":"Ver","sections":[{"title":"s","rows":[{"id":"r","title":"T"}]}]}'::jsonb
      WHEN 'interactive_cta_url' THEN '{"kind":"interactive_cta_url","body":"b","display_text":"Abrir","url":"https://x"}'::jsonb
      WHEN 'template' THEN '{"kind":"template","template_name":"t","template_language":"pt_BR"}'::jsonb
      WHEN 'auto_reply' THEN '{"kind":"text","body":"auto"}'::jsonb
    END;

    IF v_kind IN ('text','media','interactive_buttons','interactive_list','interactive_cta_url') THEN
      SELECT jsonb_build_object(
        'service_window_status', service_window_status,
        'service_window_opened_at', service_window_opened_at,
        'service_window_expires_at', service_window_expires_at,
        'last_inbound_at', last_inbound_at,
        'unread_count', unread_count,
        'conversation_status', conversation_status
      ), first_response_at
        INTO v_after, v_fr_after FROM wa_conversations WHERE id=v_conv;
      IF v_after = v_frozen AND v_fr_after IS NOT DISTINCT FROM v_fr_before THEN
        RAISE NOTICE 'kind=% → OK (bloqueado por janela fechada)', v_kind;
      ELSE
        RAISE EXCEPTION 'kind=% mudou estado', v_kind;
      END IF;
      CONTINUE;
    END IF;

    v_origin := CASE WHEN v_kind='template' THEN 'template' ELSE 'auto_reply' END;
    v_msg_type := CASE WHEN v_kind='template' THEN 'template' ELSE 'text' END;

    INSERT INTO wa_conversation_messages(
      workspace_id, conversation_id, direction, origin, message_type,
      body, template_name, status, payload
    ) VALUES (
      v_ws, v_conv, 'outbound', v_origin, v_msg_type,
      '[e2e] '||v_kind, CASE WHEN v_kind='template' THEN 't' ELSE NULL END,
      'queued', v_payload
    ) RETURNING id INTO v_msg;

    INSERT INTO wa_service_queue(
      workspace_id, conversation_id, connection_id, phone_number_id, contact_phone,
      message_id, payload, idempotency_key, origin, priority, status
    ) VALUES (
      v_ws, v_conv, v_conn, v_pnid, '5599900000001',
      v_msg, v_payload, 'e2e:'||v_kind||':'||v_msg::text, v_origin, 3, 'pending'
    );

    UPDATE wa_conversations
      SET last_outbound_at=now(), last_message_at=now(), last_message_preview='[e2e] '||v_kind
      WHERE id=v_conv;

    v_wamid := 'wamid.E2E.'||v_kind||'.'||v_msg::text;
    UPDATE wa_service_queue SET status='sent', wamid=v_wamid, attempt=1 WHERE message_id=v_msg;
    UPDATE wa_conversation_messages SET status='sent', wamid=v_wamid, sent_at=now() WHERE id=v_msg;
    UPDATE wa_conversation_messages SET status='delivered', delivered_at=now() WHERE id=v_msg;
    UPDATE wa_conversation_messages SET status='read', read_at=now() WHERE id=v_msg;

    SELECT jsonb_build_object(
      'service_window_status', service_window_status,
      'service_window_opened_at', service_window_opened_at,
      'service_window_expires_at', service_window_expires_at,
      'last_inbound_at', last_inbound_at,
      'unread_count', unread_count,
      'conversation_status', conversation_status
    ), first_response_at
      INTO v_after, v_fr_after FROM wa_conversations WHERE id=v_conv;

    IF v_after <> v_frozen THEN
      RAISE EXCEPTION 'kind=% ALTEROU janela: after=%', v_kind, v_after;
    END IF;

    IF v_kind = 'auto_reply' THEN
      IF v_fr_after IS DISTINCT FROM v_fr_before THEN
        RAISE EXCEPTION 'auto_reply MUDOU first_response_at (%→%)', v_fr_before, v_fr_after;
      END IF;
      RAISE NOTICE 'kind=auto_reply → OK: janela intacta; first_response_at preservado (%)', v_fr_before;
    ELSE
      IF v_fr_before IS NULL AND v_fr_after IS NULL THEN
        RAISE EXCEPTION 'kind=% NÃO marcou SLA na 1ª resposta', v_kind;
      ELSIF v_fr_before IS NOT NULL AND v_fr_after IS DISTINCT FROM v_fr_before THEN
        RAISE EXCEPTION 'kind=% REINICIOU SLA (%→%)', v_kind, v_fr_before, v_fr_after;
      ELSE
        RAISE NOTICE 'kind=% → OK: janela intacta; SLA %',
          v_kind,
          CASE WHEN v_fr_before IS NULL THEN 'marcado 1x ('||v_fr_after||')'
               ELSE 'preservado ('||v_fr_before||')' END;
      END IF;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'service_window_status', service_window_status,
    'service_window_expires_at', service_window_expires_at,
    'last_inbound_at', last_inbound_at,
    'last_outbound_at', last_outbound_at,
    'last_message_preview', last_message_preview,
    'unread_count', unread_count,
    'first_response_at', first_response_at,
    'conversation_status', conversation_status,
    'msg_count', (SELECT count(*) FROM wa_conversation_messages WHERE conversation_id=v_conv),
    'queue_sent', (SELECT count(*) FROM wa_service_queue WHERE conversation_id=v_conv AND status='sent')
  ) INTO v_snap FROM wa_conversations WHERE id=v_conv;
  RAISE NOTICE '=== SNAPSHOT FINAL: % ===', v_snap;

  DELETE FROM wa_service_queue WHERE conversation_id=v_conv;
  DELETE FROM wa_conversation_messages WHERE conversation_id=v_conv;
  DELETE FROM wa_conversations WHERE id=v_conv;
  RAISE NOTICE '=== CLEANUP OK ===';
END $$;
