create or replace function public.admin_purge_workspace(_ws uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  pass int;
  deleted jsonb := '{}'::jsonb;
  n bigint;
  remaining int;
  tables text[] := array[
    'campaign_events','campaign_clicks','campaign_timeline','campaign_audit_log','campaign_recipients','campaigns',
    'wa_conversation_events','wa_conversation_messages','wa_internal_notes','wa_conversations','wa_service_queue',
    'wa_campaign_attempts','wa_campaign_routes','wa_test_sends','wa_health_events','wa_health_status',
    'message_dead_letters','message_logs','message_stock_reservations','message_stock','wa_campaigns',
    'contact_list_items','contact_tag_assignments','contact_tags','contact_lists','contacts','import_jobs','opt_outs',
    'whatsapp_messages','whatsapp_inbox','whatsapp_number_grants','whatsapp_template_grants',
    'whatsapp_profile_audit_logs','whatsapp_template_requests','whatsapp_templates','whatsapp_connections','whatsapp_wabas',
    'reports','projects','clients','calendar_events','workspace_google_calendar','wa_attendance_settings',
    'wallet_reservations','wallet_transactions','deposits','workspace_wallets','notifications','onboarding_checklist',
    'workspace_members'
  ];
begin
  -- dependentes de campaigns/wa_campaigns sem workspace_id
  delete from campaign_public_dispatches where campaign_id in (select id from campaigns where workspace_id = _ws);
  delete from campaign_public_settings where campaign_id in (select id from campaigns where workspace_id = _ws);
  delete from public_metrics_override where campaign_id in (select id from campaigns where workspace_id = _ws);
  delete from public_progress_simulation where campaign_id in (select id from campaigns where workspace_id = _ws);
  delete from upsell_campaigns where campaign_id in (select id from campaigns where workspace_id = _ws);
  delete from whatsapp_onboarding_logs where connection_id in (select id from whatsapp_connections where workspace_id = _ws);
  delete from attendance_number_grants where connection_id in (select id from whatsapp_connections where workspace_id = _ws);
  delete from whatsapp_display_name_attempts where connection_id in (select id from whatsapp_connections where workspace_id = _ws);

  for pass in 1..6 loop
    remaining := 0;
    foreach t in array tables loop
      begin
        execute format('delete from public.%I where workspace_id = $1', t) using _ws;
        get diagnostics n = row_count;
        if n > 0 then
          deleted := jsonb_set(deleted, array[t], to_jsonb(coalesce((deleted->>t)::bigint,0) + n));
        end if;
      exception when others then
        remaining := remaining + 1;
      end;
    end loop;
    exit when remaining = 0;
  end loop;

  delete from workspaces where id = _ws;
  return jsonb_build_object('ok', true, 'deleted', deleted);
end;
$$;

revoke all on function public.admin_purge_workspace(uuid) from public, anon, authenticated;