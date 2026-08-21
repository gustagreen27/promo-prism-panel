create or replace function public.wa_import_phones_chunk(
  _list_id uuid,
  _ws uuid,
  _rows jsonb,
  _source text default 'painel'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  z uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  if not (public.is_workspace_member(_ws, auth.uid()) or public.is_internal_staff(auth.uid())) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (select 1 from public.contact_lists l where l.id = _list_id and l.workspace_id = _ws) then
    raise exception 'LIST_NOT_IN_WORKSPACE';
  end if;

  with src as (
    select distinct on (phone) phone, name from (
      select nullif(trim(r->>'phone'), '') as phone,
             nullif(trim(r->>'name'), '') as name
      from jsonb_array_elements(_rows) r
    ) x
    where x.phone is not null
  ),
  ins as (
    insert into public.contacts (phone, name, workspace_id, client_id, source, opt_in, opt_in_at)
    select s.phone, s.name, _ws, null, _source, true, now() from src s
    on conflict (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), phone, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing
    returning id, phone
  ),
  allc as (
    select id, phone from ins
    union
    select c.id, c.phone
    from public.contacts c
    join src s on s.phone = c.phone
    where coalesce(c.workspace_id, z) = coalesce(_ws, z) and c.client_id is null
  ),
  link as (
    insert into public.contact_list_items (list_id, contact_id, workspace_id)
    select _list_id, a.id, _ws from allc a
    on conflict (list_id, contact_id) do nothing
    returning 1
  )
  select count(*) into v_total from allc;

  return v_total;
end;
$$;

grant execute on function public.wa_import_phones_chunk(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.wa_import_phones_chunk(uuid, uuid, jsonb, text) to service_role;