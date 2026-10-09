
-- STAFF INPUT APP V1 — Supabase bootstrap (run in SQL Editor)
create extension if not exists pgcrypto;

create table if not exists public.profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check(role in ('CSKH','CBLD','ADMIN')),
  display_name text,
  active boolean not null default true
);

create table if not exists public.assignments(
  project_id text not null,
  shop_id text not null,
  cskh_user_id uuid references public.profiles(user_id),
  cbld_user_id uuid references public.profiles(user_id),
  cskh_name text,
  cbld_name text,
  primary key(project_id,shop_id)
);

create table if not exists public.shop_debt_snapshot(
  project_id text not null,
  shop_id text not null,
  as_of timestamptz not null,
  ps_kpi numeric(20,2) not null default 0,
  ps_collected numeric(20,2) not null default 0,
  official_kpi numeric(20,2) not null default 0,
  official_collected numeric(20,2) not null default 0,
  source_hash text,
  primary key(project_id,shop_id,as_of)
);

create table if not exists public.staff_events(
  event_id uuid primary key default gen_random_uuid(),
  project_id text not null,
  shop_id text not null,
  event_type text not null check(event_type in
    ('PLAN_CREATED','PLAN_CHANGED','PLAN_CANCELLED','PAYMENT_REPORTED','EVIDENCE_UPLOADED','NOTE_ADDED')),
  event_time timestamptz not null default now(),
  created_by uuid not null references public.profiles(user_id),
  amount numeric(20,2),
  expected_date date,
  signal_type text,
  note text,
  supersedes_event_id uuid references public.staff_events(event_id),
  cancelled_reason text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.evidence_files(
  evidence_id uuid primary key default gen_random_uuid(),
  payment_event_id uuid not null references public.staff_events(event_id),
  project_id text not null,
  shop_id text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.profiles(user_id),
  uploaded_at timestamptz not null default now()
);

create index if not exists ix_staff_events_shop on public.staff_events(project_id,shop_id,event_time desc);

alter table public.profiles enable row level security;
alter table public.assignments enable row level security;
alter table public.shop_debt_snapshot enable row level security;
alter table public.staff_events enable row level security;
alter table public.evidence_files enable row level security;

create or replace function public.my_role() returns text language sql stable security definer
set search_path=public as $$ select role from public.profiles where user_id=auth.uid() and active=true $$;

drop policy if exists "profile self/admin" on public.profiles;
create policy "profile self/admin" on public.profiles for select using(user_id=auth.uid() or public.my_role()='ADMIN');

drop policy if exists "assignment scoped read" on public.assignments;
create policy "assignment scoped read" on public.assignments for select using(
 public.my_role()='ADMIN' or cskh_user_id=auth.uid() or cbld_user_id=auth.uid()
);

drop policy if exists "debt scoped read" on public.shop_debt_snapshot;
create policy "debt scoped read" on public.shop_debt_snapshot for select using(
 public.my_role()='ADMIN' or exists(
   select 1 from public.assignments a where a.project_id=shop_debt_snapshot.project_id
   and a.shop_id=shop_debt_snapshot.shop_id
   and (a.cskh_user_id=auth.uid() or a.cbld_user_id=auth.uid())
 )
);

drop policy if exists "events scoped read" on public.staff_events;
create policy "events scoped read" on public.staff_events for select using(
 public.my_role()='ADMIN' or exists(
   select 1 from public.assignments a where a.project_id=staff_events.project_id
   and a.shop_id=staff_events.shop_id
   and (a.cskh_user_id=auth.uid() or a.cbld_user_id=auth.uid())
 )
);

drop policy if exists "cskh event insert" on public.staff_events;
create policy "cskh event insert" on public.staff_events for insert with check(
 created_by=auth.uid() and (
 public.my_role()='ADMIN' or exists(
   select 1 from public.assignments a where a.project_id=staff_events.project_id
   and a.shop_id=staff_events.shop_id and a.cskh_user_id=auth.uid()
 ))
);

-- No UPDATE/DELETE policy for staff_events: append-only audit history.

-- Evidence metadata follows the same shop scope as the payment event.
drop policy if exists "evidence scoped read" on public.evidence_files;
create policy "evidence scoped read" on public.evidence_files for select using(
 public.my_role()='ADMIN' or exists(
   select 1 from public.assignments a
   where a.project_id=evidence_files.project_id
   and a.shop_id=evidence_files.shop_id
   and (a.cskh_user_id=auth.uid() or a.cbld_user_id=auth.uid())
 )
);

drop policy if exists "cskh evidence insert" on public.evidence_files;
create policy "cskh evidence insert" on public.evidence_files for insert with check(
 uploaded_by=auth.uid() and exists(
   select 1 from public.staff_events e
   join public.assignments a on a.project_id=e.project_id and a.shop_id=e.shop_id
   where e.event_id=evidence_files.payment_event_id
   and e.project_id=evidence_files.project_id
   and e.shop_id=evidence_files.shop_id
   and e.event_type='PAYMENT_REPORTED'
   and a.cskh_user_id=auth.uid()
 )
);

-- Private UNC path convention: <project_id>/<shop_id>/<payment_event_id>/<filename>.
insert into storage.buckets (id, name, public)
values ('unc', 'unc', false)
on conflict (id) do update set public=false;

drop policy if exists "unc scoped read" on storage.objects;
create policy "unc scoped read" on storage.objects for select using(
 bucket_id='unc' and (
   public.my_role()='ADMIN' or exists(
     select 1 from public.assignments a
     where a.project_id=split_part(name,'/',1)
     and a.shop_id=split_part(name,'/',2)
     and (a.cskh_user_id=auth.uid() or a.cbld_user_id=auth.uid())
   )
 )
);

drop policy if exists "cskh unc upload" on storage.objects;
create policy "cskh unc upload" on storage.objects for insert with check(
 bucket_id='unc' and exists(
   select 1 from public.assignments a
   where a.project_id=split_part(name,'/',1)
   and a.shop_id=split_part(name,'/',2)
   and a.cskh_user_id=auth.uid()
 )
);

-- No UPDATE/DELETE policy is provided for evidence_files or storage.objects.
-- Keep service_role key server-side only. Never expose it in browser/GitHub.
