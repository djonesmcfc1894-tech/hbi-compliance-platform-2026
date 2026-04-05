-- ================================================================
-- COMPLIANCE HUB V3 - FULL SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ================================================================

-- Drop everything first (clean slate)
drop table if exists stakeholder_feedback cascade;
drop table if exists yp_feedback cascade;
drop table if exists reg40_visits cascade;
drop table if exists monthly_tracker cascade;
drop table if exists training cascade;
drop table if exists staff cascade;
drop table if exists children cascade;
drop table if exists home_items cascade;
drop table if exists home_details cascade;
drop table if exists profiles cascade;

-- ── Profiles ──────────────────────────────────────────────────────
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'user',
  home_name text,
  trial_expires_at timestamptz,
  is_suspended boolean default false,
  created_at timestamptz default now()
);

-- ── Home Details ──────────────────────────────────────────────────
create table home_details (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade unique,
  registered_manager text,
  ri_name text,
  ofsted_number text,
  max_occupancy int,
  phone text,
  email text,
  address text,
  updated_at timestamptz default now()
);

-- ── Home Items (compliance checklist) ─────────────────────────────
create table home_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  label text not null,
  item_type text default 'date',
  freq text,
  last_completed date,
  status text default 'pending',
  notes text,
  sort_order int default 0,
  updated_at timestamptz default now()
);

-- ── Children ──────────────────────────────────────────────────────
create table children (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  date_of_birth date,
  placement_start date,
  placing_authority text,
  key_worker text,
  risk_assessment_date date,
  gp_registration date,
  dentist_registration date,
  optician_registration date,
  consent_forms boolean default false,
  delegation_of_authority boolean default false,
  initial_placement_plan boolean default false,
  pep_date date,
  lac_date date,
  ehcp_date date,
  care_plan_date date,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ── Monthly Tracker ───────────────────────────────────────────────
create table monthly_tracker (
  id uuid default gen_random_uuid() primary key,
  child_id uuid references children(id) on delete cascade,
  month text not null,
  incidents int default 0,
  mfh int default 0,
  pi int default 0,
  keywork int default 0,
  notes text,
  unique(child_id, month)
);

-- ── Staff ─────────────────────────────────────────────────────────
create table staff (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  role text,
  start_date date,
  dbs_number text,
  dbs_expiry date,
  photo_id_1 boolean default false,
  photo_id_2 boolean default false,
  proof_of_address boolean default false,
  driving_licence boolean default false,
  performance_rating text default 'Satisfactory',
  supervision_type text default 'Monthly',
  supervision_jan date, supervision_feb date, supervision_mar date,
  supervision_apr date, supervision_may date, supervision_jun date,
  supervision_jul date, supervision_aug date, supervision_sep date,
  supervision_oct date, supervision_nov date, supervision_dec date,
  created_at timestamptz default now()
);

-- ── Training ──────────────────────────────────────────────────────
create table training (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  staff_name text not null,
  safeguarding date,
  first_aid date,
  fire_safety date,
  moving___handling date,
  team_teach date,
  medication date,
  restraint_pbs date,
  created_at timestamptz default now()
);

-- ── Reg 40 Visits ─────────────────────────────────────────────────
create table reg40_visits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  visit_date date,
  visit_type text default 'Announced',
  completed_by text,
  rating text,
  outcomes text,
  report_submitted boolean default false,
  created_at timestamptz default now()
);

-- ── YP Feedback ───────────────────────────────────────────────────
create table yp_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  child_name text not null,
  month text not null,
  completed boolean default false,
  unique(user_id, child_name, month)
);

-- ── Stakeholder Feedback ──────────────────────────────────────────
create table stakeholder_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  stakeholder_type text not null,
  feedback_date date,
  summary text,
  action_taken text,
  logged_by text
);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

alter table profiles enable row level security;
alter table home_details enable row level security;
alter table home_items enable row level security;
alter table children enable row level security;
alter table monthly_tracker enable row level security;
alter table staff enable row level security;
alter table training enable row level security;
alter table reg40_visits enable row level security;
alter table yp_feedback enable row level security;
alter table stakeholder_feedback enable row level security;

-- Profiles
create policy "users_view_own" on profiles for select using (auth.uid() = id);
create policy "users_update_own" on profiles for update using (auth.uid() = id);
create policy "admin_all_profiles" on profiles for all using (auth.jwt() ->> 'email' = 'd.jones.mcfc1894@gmail.com');

-- All other tables - users manage own, admin manages all
do $$
declare
  t text;
begin
  foreach t in array array['home_details','home_items','children','staff','training','reg40_visits','yp_feedback','stakeholder_feedback']
  loop
    execute format('create policy "users_own_%s" on %s for all using (auth.uid() = user_id)', t, t);
    execute format('create policy "admin_all_%s" on %s for all using (auth.jwt() ->> ''email'' = ''d.jones.mcfc1894@gmail.com'')', t, t);
  end loop;
end;
$$;

-- Monthly tracker (uses child_id not user_id)
create policy "users_own_monthly_tracker" on monthly_tracker for all using (
  exists (select 1 from children where id = monthly_tracker.child_id and user_id = auth.uid())
);
create policy "admin_all_monthly_tracker" on monthly_tracker for all using (
  auth.jwt() ->> 'email' = 'd.jones.mcfc1894@gmail.com'
);

-- ================================================================
-- ADMIN PROFILE
-- ================================================================

insert into profiles (id, email, role)
values ('d3819ee6-d785-486c-a739-bc62714ce0b4', 'd.jones.mcfc1894@gmail.com', 'admin')
on conflict (id) do update set role = 'admin';
