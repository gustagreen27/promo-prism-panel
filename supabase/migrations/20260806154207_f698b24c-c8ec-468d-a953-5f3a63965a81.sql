insert into public.workspaces (name, slug, meta_business_id, meta_business_name)
values ('BM Ice Laser Brasilia DF', 'bm-ice-laser-496393', '750492059496393', 'BM Ice Laser 33.931.108/0001-57 Brasilia DF')
on conflict do nothing;

insert into public.whatsapp_wabas (nome_interno, waba_id, business_id, access_token, status, onboarded_via, onboarded_at, workspace_id)
select 'Atendimento laser', '872897082315010', '750492059496393',
  'EAAUZBcUV2uOkBSHFRHqUQcTfwozxCqT3poRb6P5CqaSQldI3Ib0J3urs2bg7leYZC3mZC3YudfanvCuZBj65ULfAXuLtw6z6H9600Fcgzm6gjycohb0nAxtLrKrGPOgtytYx78mWfHvDpn1CqHH68FLVmAR9b2WntZBN9PAOeNZApt5ggT3rkJrFyYLYvmAwZDZD',
  'ativo', 'manual', now(), w.id
from public.workspaces w where w.meta_business_id = '750492059496393'
on conflict (waba_id) do update set
  access_token = excluded.access_token,
  business_id = excluded.business_id,
  workspace_id = excluded.workspace_id,
  status = 'ativo';