-- Pilot-only additive/shared-workspace patch. No production source is touched.
alter table public.staff_events add column if not exists owner_staff_id uuid references public.profiles(user_id);
alter table public.staff_events add column if not exists owner_cskh_name text;
alter table public.staff_events add column if not exists owner_cbld_name text;
alter table public.assignments add column if not exists owner_staff_id text;
alter table public.staff_events add column if not exists owner_staff_key text;

create or replace function public.set_staff_event_owner()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare a record;
begin
  select owner_staff_id, cskh_user_id, cskh_name, cbld_name into a
  from public.assignments
  where project_id = new.project_id and shop_id = new.shop_id;
  if not found then raise exception 'SHOP_NOT_ASSIGNED'; end if;
  new.owner_staff_id := a.cskh_user_id;
  new.owner_staff_key := a.owner_staff_id;
  new.owner_cskh_name := a.cskh_name;
  new.owner_cbld_name := a.cbld_name;
  return new;
end;
$$;

drop trigger if exists trg_staff_event_owner on public.staff_events;
create trigger trg_staff_event_owner before insert on public.staff_events
for each row execute function public.set_staff_event_owner();

drop policy if exists "assignment scoped read" on public.assignments;
create policy "shared workspace assignment read" on public.assignments for select using(public.my_role() is not null);

drop policy if exists "debt scoped read" on public.shop_debt_snapshot;
create policy "shared workspace debt read" on public.shop_debt_snapshot for select using(public.my_role() is not null);

drop policy if exists "events scoped read" on public.staff_events;
create policy "shared workspace event read" on public.staff_events for select using(public.my_role() is not null);

drop policy if exists "cskh event insert" on public.staff_events;
create policy "shared workspace event insert" on public.staff_events for insert with check(
  created_by=auth.uid() and public.my_role() is not null and
  exists(select 1 from public.assignments a where a.project_id=staff_events.project_id and a.shop_id=staff_events.shop_id)
);

drop policy if exists "evidence scoped read" on public.evidence_files;
create policy "shared workspace evidence read" on public.evidence_files for select using(public.my_role() is not null);

drop policy if exists "cskh evidence insert" on public.evidence_files;
create policy "shared workspace evidence insert" on public.evidence_files for insert with check(
  uploaded_by=auth.uid() and public.my_role() is not null and
  exists(select 1 from public.staff_events e where e.event_id=evidence_files.payment_event_id and e.project_id=evidence_files.project_id and e.shop_id=evidence_files.shop_id and e.event_type='PAYMENT_REPORTED')
);

drop policy if exists "unc scoped read" on storage.objects;
create policy "shared workspace unc read" on storage.objects for select using(bucket_id='unc' and public.my_role() is not null);

drop policy if exists "cskh unc upload" on storage.objects;
create policy "shared workspace unc upload" on storage.objects for insert with check(bucket_id='unc' and public.my_role() is not null);

