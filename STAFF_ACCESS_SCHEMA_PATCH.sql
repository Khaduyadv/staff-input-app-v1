-- Pilot-only additive schema patch. No RLS policy is relaxed.
alter table public.profiles add column if not exists staff_access_id text;
create unique index if not exists ux_profiles_staff_access_id on public.profiles(staff_access_id) where staff_access_id is not null;
