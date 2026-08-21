do $$
declare v int;
begin
  with ins as (
    insert into public.contacts (phone, name, workspace_id, client_id, source, opt_in)
    values ('5500000000001','__tmp_test__', null, null, 'tmp-test', true)
    on conflict (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), phone, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing
    returning id
  ) select count(*) into v from ins;
  raise notice 'inserted %', v;
  delete from public.contacts where phone = '5500000000001' and source = 'tmp-test';
end $$;