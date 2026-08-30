CREATE OR REPLACE FUNCTION public.wa_import_phones_chunk(_list_id uuid, _ws uuid, _rows jsonb, _source text DEFAULT 'painel'::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
declare
  v_total int := 0;
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
  ups as (
    insert into public.contacts (phone, name, workspace_id, client_id, source, opt_in, opt_in_at)
    select s.phone, s.name, _ws, null, _source, true, now() from src s
    on conflict (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), phone, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set name = coalesce(public.contacts.name, excluded.name)
    returning id
  ),
  link as (
    insert into public.contact_list_items (list_id, contact_id, workspace_id)
    select _list_id, u.id, _ws from ups u
    on conflict (list_id, contact_id) do nothing
    returning 1
  )
  select count(*) into v_total from link;

  return v_total;
end;
$$;