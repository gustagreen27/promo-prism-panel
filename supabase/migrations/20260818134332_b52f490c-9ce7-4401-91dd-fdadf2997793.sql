insert into public.whatsapp_wabas (waba_id, business_id, nome_interno, status, onboarded_via, onboarded_at)
values ('1718045739518689', '1388175752905586', 'WABA 1718045739518689', 'ativo', 'manual_admin', now())
on conflict do nothing;