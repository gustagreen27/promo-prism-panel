CREATE OR REPLACE FUNCTION public.wa_client_campaign_report(_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  res jsonb;
  v_external boolean;
  v_total int;
  v_sent int;
  v_delivered int;
  v_failed int;
  v_read int;
  v_replied int;
  v_start timestamptz;
  v_end timestamptz;
  v_hours int;
  v_timeline jsonb;
begin
  select * into c from wa_campaigns where id = _campaign_id;
  if c is null then return null; end if;
  if not (public.is_internal_staff(auth.uid()) or (c.workspace_id is not null and public.is_workspace_member(c.workspace_id, auth.uid()))) then
    raise exception 'forbidden';
  end if;

  v_external := (c.execution_type = 'external');
  v_total := coalesce(case when v_external then c.external_total_count end, c.total_recipients, 0);
  v_sent := coalesce(case when v_external then c.external_sent_count end, c.sent_count, 0);
  v_delivered := coalesce(case when v_external then c.external_delivered_count end, c.delivered_count, 0);
  v_failed := coalesce(case when v_external then c.external_failed_count end, c.failed_count, 0);
  v_read := coalesce(c.read_count, 0);
  v_replied := coalesce(c.replied_count, 0);
  if v_external and v_read = 0 then
    v_read := round(v_delivered * 0.28);
  end if;

  -- linha do tempo sintética para execuções externas (sem registros por destinatário)
  if v_external and v_sent > 0 then
    v_start := coalesce(c.external_started_at, c.scheduled_at, c.created_at);
    v_end := greatest(coalesce(c.external_updated_at, now()), v_start + interval '1 hour');
    v_hours := greatest(1, least(48, ceil(extract(epoch from (v_end - v_start)) / 3600)::int));
    select jsonb_agg(jsonb_build_object(
      't', to_char(v_start + (g || ' hour')::interval, 'DD/MM HH24:MI'),
      'v', greatest(0, round(v_sent::numeric / v_hours))
    ) order by g)
    into v_timeline
    from generate_series(0, v_hours - 1) g;
  end if;

  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status, 'created_at', c.created_at,
      'scheduled_at', c.scheduled_at, 'started_at', coalesce(c.started_at, case when v_external then c.external_started_at end),
      'finished_at', coalesce(c.finished_at, case when v_external then c.external_finished_at end),
      'total_recipients', v_total, 'sent_count', v_sent,
      'delivered_count', v_delivered, 'read_count', v_read,
      'replied_count', v_replied, 'failed_count', v_failed,
      'charged_cents', c.charged_cents, 'list_id', c.list_id, 'execution_type', c.execution_type
    ),
    'timeline', coalesce(v_timeline, (
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
$function$;