UPDATE public.whatsapp_wabas
SET nome_interno = 'Pimenta Estetica (WABA 8196)', last_sync_error = NULL, last_synced_at = now(), updated_at = now()
WHERE waba_id = '819673147807084';

UPDATE public.whatsapp_connections c
SET status = 'ativa',
    meta_sync_status = 'connected',
    verified_name = 'Pimenta Estetica',
    display_name = 'Pimenta Estetica',
    current_display_name = 'Pimenta Estetica',
    code_verification_status = 'VERIFIED',
    waba_ref_id = w.id,
    last_meta_sync_at = now(),
    last_synced_at = now(),
    updated_at = now()
FROM public.whatsapp_wabas w
WHERE w.waba_id = '819673147807084'
  AND c.phone_number_id = '1277873665405062';