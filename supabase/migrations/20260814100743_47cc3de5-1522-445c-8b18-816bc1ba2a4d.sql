UPDATE public.whatsapp_wabas
SET access_token = 'EAAhGlRjSgnkBSPoZCvYWZA05cLLJOUxyuOm7nMsAiFr2hZCm7ZBejUQonADNyocz8k3N2vIN0XneiusbQQ8ZAYjctPgMnGB2eUi7pz5WL6PZA0wFR7OFJvjUyEZBi6aegZChVZBZCw0ROBtU7bhBe0PlQmZBqq0H8TtvJcdnJ2CPSSVNIxLaMZCPGMfAy4fTJe1krbODIQZDZD',
    nome_interno = 'Camylle Gomes dos Santos',
    business_id = '27388997630771807',
    status = 'ativo'
WHERE waba_id = '1007888915415085';

INSERT INTO public.whatsapp_connections (
  waba_ref_id, workspace_id, phone_number_id, waba_id, business_id,
  display_phone, phone, name, nome_interno, display_name, verified_name,
  provider, graph_api_version, status, quality_rating, meta_sync_status, last_seen_at
)
SELECT w.id, w.workspace_id, '1245405735324155', '1007888915415085', '27388997630771807',
  '+1 555-471-0718', '15554710718', 'Camylle Gomes dos Santos', 'Camylle Gomes dos Santos',
  'Camylle Gomes dos Santos', 'Camylle Gomes dos Santos',
  'meta_cloud', 'v21.0', 'ativo', 'UNKNOWN', 'connected', now()
FROM public.whatsapp_wabas w
WHERE w.waba_id = '1007888915415085'
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_connections c WHERE c.phone_number_id = '1245405735324155'
  );