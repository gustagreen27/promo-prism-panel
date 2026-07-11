
UPDATE public.whatsapp_connections
SET name = 'Valdecio',
    nome_interno = 'Valdecio',
    display_name = 'Valdecio',
    verified_name = 'Valdecio',
    use_global_token = true,
    status = 'ativo',
    meta_sync_status = 'connected'
WHERE phone_number_id = '1164531273417996';

UPDATE public.whatsapp_wabas
SET nome_interno = COALESCE(NULLIF(nome_interno,''), 'Valdecio'),
    observacoes = COALESCE(observacoes, 'Propriedade de: BM Fio 10 Jeans')
WHERE waba_id = '1000818919385471';
