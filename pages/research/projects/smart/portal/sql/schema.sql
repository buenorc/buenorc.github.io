-- =============================================================================
--  SMART · LAKE TWIN — Supabase schema
--  Run this in  Supabase  ->  SQL Editor  ->  New query  ->  Run.
--  It creates the tables the portal + Python pipeline use, and the Row Level
--  Security (RLS) policies that enforce the email allow-list.
--
--  SECURITY MODEL
--   * allowed_emails  : the access list. Admins manage it from admin.html.
--   * public data     : stations, sensor_readings, public model_outputs -> anyone
--   * restricted data : forecast_inputs, non-public model_outputs -> members only
--   * writes          : done by the Python pipeline using the SERVICE ROLE key,
--                       which bypasses RLS. The browser (anon key) can never write
--                       sensor/model rows.
-- =============================================================================

-- ---------- helper: is the current user an enabled admin? --------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.allowed_emails a
    where a.email = lower(auth.jwt()->>'email')
      and a.enabled and a.is_admin
  );
$$;

-- ---------- helper: is the current user an enabled member? -------------------
create or replace function public.is_member()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.allowed_emails a
    where a.email = lower(auth.jwt()->>'email')
      and a.enabled
  );
$$;

-- =============================================================================
--  1) ACCESS LIST
-- =============================================================================
create table if not exists public.allowed_emails (
  email       text primary key,
  is_admin    boolean not null default false,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;

-- a signed-in user may read their OWN row (so the portal can check access)…
drop policy if exists ae_read_self on public.allowed_emails;
create policy ae_read_self on public.allowed_emails
  for select using ( email = lower(auth.jwt()->>'email') );

-- …and admins may read every row.
drop policy if exists ae_read_admin on public.allowed_emails;
create policy ae_read_admin on public.allowed_emails
  for select using ( public.is_admin() );

-- only admins may insert / update / delete the list.
drop policy if exists ae_write_admin on public.allowed_emails;
create policy ae_write_admin on public.allowed_emails
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- >>> SEED THE FIRST ADMIN (edit the email, then it can manage everyone else) <<<
insert into public.allowed_emails (email, is_admin, enabled)
values ('rafael.bueno.itt@gmail.com', true, true)
on conflict (email) do update set is_admin = true, enabled = true;

-- =============================================================================
--  2) STATIONS  (public read)
-- =============================================================================
create table if not exists public.stations (
  id       text primary key,          -- e.g. 'PS-01'
  name     text,
  lat      double precision,
  lon      double precision,
  status   text default 'online',     -- online | offline | demo
  meta     jsonb
);
alter table public.stations enable row level security;
drop policy if exists st_read_all on public.stations;
create policy st_read_all on public.stations for select using ( true );

-- =============================================================================
--  3) SENSOR READINGS  (public read; written by pipeline/service role)
-- =============================================================================
create table if not exists public.sensor_readings (
  id           bigint generated always as identity primary key,
  station      text references public.stations(id),
  time         timestamptz not null default now(),
  water_temp   double precision,
  air_temp     double precision,
  humidity     double precision,
  water_level  double precision,
  turbidity    double precision,
  ph           double precision,
  chlorophyll  double precision,
  conductivity double precision,
  battery      double precision,
  rssi         integer
);
create index if not exists sr_station_time on public.sensor_readings (station, time desc);
alter table public.sensor_readings enable row level security;
drop policy if exists sr_read_all on public.sensor_readings;
create policy sr_read_all on public.sensor_readings for select using ( true );

-- =============================================================================
--  4) MODEL OUTPUTS  (public flag decides who can read)
--     payload holds a JSON field, e.g. depth-time profile or surface grid.
-- =============================================================================
create table if not exists public.model_outputs (
  id        bigint generated always as identity primary key,
  model     text,                     -- 'GLM' | 'Delft3D'
  kind      text,                     -- 'profile' | 'surface' | 'level' | ...
  issued    timestamptz not null default now(),
  is_public boolean not null default true,
  payload   jsonb
);
create index if not exists mo_kind_issued on public.model_outputs (kind, issued desc);
alter table public.model_outputs enable row level security;
drop policy if exists mo_read_public on public.model_outputs;
create policy mo_read_public on public.model_outputs
  for select using ( is_public or public.is_member() );

-- =============================================================================
--  5) FORECAST INPUTS  (members only)
-- =============================================================================
create table if not exists public.forecast_inputs (
  id       bigint generated always as identity primary key,
  issued   timestamptz not null default now(),
  source   text,                      -- 'GFS' | 'Open-Meteo' | 'GloFAS' ...
  cycle    text,
  payload  jsonb
);
create index if not exists fi_issued on public.forecast_inputs (issued desc);
alter table public.forecast_inputs enable row level security;
drop policy if exists fi_read_member on public.forecast_inputs;
create policy fi_read_member on public.forecast_inputs
  for select using ( public.is_member() );

-- =============================================================================
--  6) INDICATORS  (limnological, members only) — optional
-- =============================================================================
create table if not exists public.indicators (
  id        bigint generated always as identity primary key,
  time      timestamptz not null default now(),
  thermocline_depth double precision,
  schmidt_stability double precision,
  lake_number       double precision,
  surface_flux      double precision,
  payload   jsonb
);
alter table public.indicators enable row level security;
drop policy if exists ind_read_member on public.indicators;
create policy ind_read_member on public.indicators
  for select using ( public.is_member() );

-- =============================================================================
--  DONE. Notes:
--   * The Python pipeline must use the SERVICE ROLE key (server-side only) to
--     INSERT rows — it bypasses RLS. Never put that key in the website.
--   * To add the first extra admin from the UI, sign in with the seeded admin
--     above, open admin.html, and add colleagues.
-- =============================================================================
