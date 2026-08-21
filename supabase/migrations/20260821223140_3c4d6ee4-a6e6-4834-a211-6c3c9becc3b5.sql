create or replace function public.wa_client_campaign_report(_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  res jsonb;
begin
  select * into c from wa_campaigns where id = _campaign_id;
  if c is null then return null; end if;
  if not (public.is_internal_staff(auth.uid()) or (c.workspace_id is not null and public.is_workspace_member(c.workspace_id, auth.uid()))) then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status, 'created_at', c.created_at,
      'scheduled_at', c.scheduled_at, 'started_at', c.started_at, 'finished_at', c.finished_at,
      'total_recipients', c.total_recipients, 'sent_count', c.sent_count,
      'delivered_count', c.delivered_count, 'read_count', c.read_count,
      'replied_count', c.replied_count, 'failed_count', c.failed_count,
      'charged_cents', c.charged_cents, 'list_id', c.list_id, 'execution_type', c.execution_type
    ),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('t', to_char(h, 'DD/MM HH24:MI'), 'v', v) order by h)
      from (
        select date_trunc('hour', sent_at) as h, count(*) as v
        from campaign_recipients where campaign_id = _campaign_id and sent_at is not null
        group by 1 order by 1 limit 240
      ) x
    ), '[]'::jsonb),
    'reply_timeline', coalesce((
      select jsonb_agg(jsonb_build_object('t', to_char(h, 'DD/MM HH24:MI'), 'v', v) order by h)
      from (
        select date_trunc('hour', coalesce(replied_at, responded_at)) as h, count(*) as v
        from campaign_recipients where campaign_id = _campaign_id and coalesce(replied_at, responded_at) is not null
        group by 1 order by 1 limit 240
      ) y
    ), '[]'::jsonb),
    'ddd', coalesce((
      select jsonb_agg(jsonb_build_object('ddd', ddd, 'v', v) order by v desc)
      from (
        select substring(regexp_replace(phone, '\D', '', 'g') from 3 for 2) as ddd, count(*) as v
        from campaign_recipients where campaign_id = _campaign_id
        group by 1 order by v desc limit 10
      ) z
    ), '[]'::jsonb),
    'errors', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'v', v) order by v desc)
      from (
        select coalesce(error_code, 'desconhecido') as code, count(*) as v
        from campaign_recipients where campaign_id = _campaign_id and status = 'failed'
        group by 1 order by v desc limit 8
      ) e
    ), '[]'::jsonb)
  ) into res;

  return res;
end;
$$;

grant execute on function public.wa_client_campaign_report(uuid) to authenticated;