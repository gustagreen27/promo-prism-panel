create or replace function public.wa_simulate_campaign_tick(_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  target_sent integer;
  already integer;
  to_send integer;
  now_ts timestamptz := now();
  pending_left integer;
begin
  select * into c from wa_campaigns where id = _campaign_id;
  if c is null or c.started_at is null or c.status not in ('running','paused') then
    return 0;
  end if;

  target_sent := floor(extract(epoch from (now_ts - c.started_at)) * coalesce(c.rate_per_second, 3))::int;

  select count(*) into already
  from campaign_recipients
  where campaign_id = _campaign_id and status <> 'pending';

  to_send := least(greatest(target_sent - already, 0), 5000);

  if to_send > 0 then
    with base as (
      select id, row_number() over (order by md5(id::text)) as rn
      from campaign_recipients
      where campaign_id = _campaign_id and status = 'pending'
      limit to_send
    ), pick as (
      select b.id, b.rn,
             now_ts - ((to_send - b.rn)::numeric / greatest(coalesce(c.rate_per_second,3),1)) * interval '1 second' as t,
             (('x'||substr(md5(b.id::text),1,8))::bit(32)::bigint % 1000) as h
      from base b
    )
    update campaign_recipients r
    set status = case
          when p.h < 21 then 'failed'::wa_recipient_status
          when p.h < 120 then 'sent'::wa_recipient_status
          when p.h < 760 then 'delivered'::wa_recipient_status
          when p.h < 985 then 'read'::wa_recipient_status
          else 'replied'::wa_recipient_status
        end,
        meta_message_id = case when p.h < 21 then null
          else 'wamid.HBg' || upper(substr(md5(p.id::text||'w'),1,26)) || '==' end,
        sent_at = case when p.h < 21 then null else p.t end,
        request_started_at = p.t - interval '400 milliseconds',
        response_received_at = p.t,
        last_attempt_at = p.t,
        attempt = 1,
        delivered_at = case when p.h >= 120 then p.t + interval '9 seconds' + (p.h % 40) * interval '1 second' else null end,
        read_at = case when p.h >= 760 then p.t + interval '70 seconds' + (p.h % 180) * interval '1 second' else null end,
        replied_at = case when p.h >= 985 then p.t + interval '200 seconds' + (p.h % 300) * interval '1 second' else null end,
        failed_at = case when p.h < 21 then p.t else null end,
        failed_reason = case when p.h < 21 then 'Rate limit hit / temporary Meta error' else null end,
        error_code = case when p.h < 21 then '131056' else null end,
        updated_at = p.t
    from pick p
    where r.id = p.id;
  end if;

  update wa_campaigns c2
  set sent_count = s.sent,
      delivered_count = s.delivered,
      read_count = s.rd,
      failed_count = s.failed,
      status = case when s.pending = 0 then 'completed'::wa_campaign_status else 'running'::wa_campaign_status end,
      finished_at = case when s.pending = 0 then now_ts else null end,
      updated_at = now_ts
  from (
    select
      count(*) filter (where status in ('sent','delivered','read','replied')) as sent,
      count(*) filter (where status in ('delivered','read','replied')) as delivered,
      count(*) filter (where status in ('read','replied')) as rd,
      count(*) filter (where status = 'failed') as failed,
      count(*) filter (where status = 'pending') as pending
    from campaign_recipients where campaign_id = _campaign_id
  ) s
  where c2.id = _campaign_id;

  return to_send;
end;
$$;

revoke all on function public.wa_simulate_campaign_tick(uuid) from public, anon, authenticated;
grant execute on function public.wa_simulate_campaign_tick(uuid) to service_role;