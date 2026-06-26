
-- =========================
-- Roles
-- =========================
create type public.app_role as enum ('admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "users see own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

-- New user trigger: create profile; first user becomes admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;

  select not exists (select 1 from public.user_roles where role = 'admin') into is_first;
  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
      on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================
-- Campaigns
-- =========================
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  destination_url text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.campaigns to authenticated;
grant select on public.campaigns to anon;
grant all on public.campaigns to service_role;
alter table public.campaigns enable row level security;

-- Public can read a campaign (needed to render iframe page by slug)
create policy "public read campaigns" on public.campaigns for select to anon, authenticated using (true);
-- Admins manage
create policy "admins insert campaigns" on public.campaigns for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "admins update campaigns" on public.campaigns for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins delete campaigns" on public.campaigns for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger campaigns_updated_at before update on public.campaigns
for each row execute function public.set_updated_at();

-- =========================
-- Clicks
-- =========================
create table public.campaign_clicks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  ip text,
  country text,
  country_code text,
  region text,
  city text,
  zip text,
  lat double precision,
  lon double precision,
  timezone text,
  isp text,
  org text,
  as_name text,
  device text,
  device_type text,
  browser text,
  browser_version text,
  os text,
  os_version text,
  referer text,
  user_agent text,
  language text,
  clicked_at timestamptz not null default now()
);
grant select on public.campaign_clicks to authenticated;
grant all on public.campaign_clicks to service_role;
-- inserts are done via service_role (server function), not from client
alter table public.campaign_clicks enable row level security;
create policy "admins read clicks" on public.campaign_clicks for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create index campaign_clicks_campaign_id_idx on public.campaign_clicks(campaign_id);
create index campaign_clicks_clicked_at_idx on public.campaign_clicks(clicked_at desc);
