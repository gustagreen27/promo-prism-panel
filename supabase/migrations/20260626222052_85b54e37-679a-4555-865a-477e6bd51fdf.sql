
do $$ begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type public.campaign_status as enum ('draft','active','paused','archived');
  end if;
end $$;

alter table public.campaigns
  add column if not exists category text,
  add column if not exists link_title text,
  add column if not exists link_description text,
  add column if not exists preview_image_url text,
  add column if not exists favicon_url text,
  add column if not exists og_title text,
  add column if not exists og_description text,
  add column if not exists og_image_url text,
  add column if not exists og_type text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists status public.campaign_status not null default 'draft',
  add column if not exists intent_score integer,
  add column if not exists intent_report jsonb,
  add column if not exists intent_checked_at timestamptz;

alter table public.campaign_clicks
  add column if not exists final_url text;
