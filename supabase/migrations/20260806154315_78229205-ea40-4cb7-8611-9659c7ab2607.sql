insert into public.whatsapp_connections (
  waba_ref_id, workspace_id, phone_number_id, waba_id, business_id,
  display_phone, phone, name, nome_interno, display_name, verified_name,
  provider, graph_api_version, status, quality_rating, meta_sync_status, last_seen_at
)
select w.id, w.workspace_id, '1199728586564325', '872897082315010', '750492059496393',
  '+1 555-938-9162', '15559389162', 'Atendimento laser', 'Atendimento laser', 'Atendimento laser', 'Atendimento laser',
  'meta_cloud', 'v26.0', 'ativo', 'UNKNOWN', 'connected', now()
from public.whatsapp_wabas w
where w.waba_id = '872897082315010'
  and not exists (select 1 from public.whatsapp_connections c where c.phone_number_id = '1199728586564325');