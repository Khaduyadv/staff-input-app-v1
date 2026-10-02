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

-- Invisible anonymous session: no login UI, but every browser still gets a Supabase JWT.
create or replace function public.ensure_workspace_session()
returns public.profiles
language plpgsql security definer set search_path=public
as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'ANONYMOUS_SESSION_REQUIRED'; end if;
  insert into public.profiles(user_id,email,role,display_name,active)
  values(auth.uid(), coalesce(auth.jwt()->>'email','shared-workspace@pilot.local'),'CSKH','Nhân viên dùng chung',true)
  on conflict (user_id) do update set active=true;
  select * into p from public.profiles where user_id=auth.uid();
  return p;
end;
$$;
grant execute on function public.ensure_workspace_session() to authenticated;

create or replace function public.workspace_append_event(
  p_project_id text, p_shop_id text, p_event_type text,
  p_amount numeric default null, p_expected_date date default null,
  p_signal_type text default null, p_note text default null,
  p_supersedes_event_id uuid default null, p_cancelled_reason text default null,
  p_payload jsonb default '{}'::jsonb
) returns public.staff_events
language plpgsql security definer set search_path=public
as $$
declare r public.staff_events;
begin
  if auth.uid() is null then raise exception 'SESSION_REQUIRED'; end if;
  perform public.ensure_workspace_session();
  if length(coalesce(p_project_id,''))=0 or length(p_project_id)>80 or length(coalesce(p_shop_id,''))=0 or length(p_shop_id)>160 then raise exception 'INVALID_IDENTITY'; end if;
  if p_event_type not in ('PLAN_CREATED','PLAN_CHANGED','PLAN_CANCELLED','PAYMENT_REPORTED','EVIDENCE_UPLOADED','NOTE_ADDED') then raise exception 'INVALID_EVENT_TYPE'; end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 1000000000000) then raise exception 'INVALID_AMOUNT'; end if;
  if length(coalesce(p_note,''))>2000 or length(coalesce(p_cancelled_reason,''))>500 then raise exception 'TEXT_TOO_LONG'; end if;
  if not exists(select 1 from public.assignments a where a.project_id=p_project_id and a.shop_id=p_shop_id) then raise exception 'SHOP_NOT_ASSIGNED'; end if;
  if (select count(*) from public.staff_events e where e.created_by=auth.uid() and e.event_time > now()-interval '1 minute') >= 30 then raise exception 'RATE_LIMITED'; end if;
  insert into public.staff_events(project_id,shop_id,event_type,created_by,amount,expected_date,signal_type,note,supersedes_event_id,cancelled_reason,payload)
  values(p_project_id,p_shop_id,p_event_type,auth.uid(),p_amount,p_expected_date,p_signal_type,p_note,p_supersedes_event_id,p_cancelled_reason,coalesce(p_payload,'{}'::jsonb))
  returning * into r;
  return r;
end;
$$;
grant execute on function public.workspace_append_event(text,text,text,numeric,date,text,text,uuid,text,jsonb) to authenticated;

create or replace function public.workspace_register_evidence(
  p_payment_event_id uuid, p_project_id text, p_shop_id text,
  p_storage_path text, p_original_filename text, p_mime_type text, p_size_bytes bigint
) returns public.evidence_files
language plpgsql security definer set search_path=public
as $$
declare r public.evidence_files; e public.staff_events;
begin
  if auth.uid() is null then raise exception 'SESSION_REQUIRED'; end if;
  perform public.ensure_workspace_session();
  select * into e from public.staff_events where event_id=p_payment_event_id and project_id=p_project_id and shop_id=p_shop_id;
  if not found or e.event_type <> 'PAYMENT_REPORTED' then raise exception 'PAYMENT_EVENT_REQUIRED'; end if;
  if left(p_storage_path, length(p_project_id||'/'||p_shop_id||'/'||p_payment_event_id::text||'/')) <> p_project_id||'/'||p_shop_id||'/'||p_payment_event_id::text||'/' or array_length(string_to_array(p_storage_path,'/'),1) <> 4 or length(split_part(p_storage_path,'/',4))=0 or length(split_part(p_storage_path,'/',4))>120 then raise exception 'INVALID_STORAGE_PATH'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_size_bytes < 1 or p_size_bytes > 10485760 then raise exception 'INVALID_EVIDENCE'; end if;
  insert into public.evidence_files(payment_event_id,project_id,shop_id,storage_path,original_filename,mime_type,size_bytes,uploaded_by)
  values(p_payment_event_id,p_project_id,p_shop_id,p_storage_path,p_original_filename,p_mime_type,p_size_bytes,auth.uid()) returning * into r;
  return r;
end;
$$;
grant execute on function public.workspace_register_evidence(uuid,text,text,text,text,text,bigint) to authenticated;

-- Direct table writes are denied; only validated RPCs can append events/evidence.
drop policy if exists "shared workspace event insert" on public.staff_events;
drop policy if exists "cskh event insert" on public.staff_events;
create policy "no direct event insert" on public.staff_events for insert with check(false);
drop policy if exists "shared workspace evidence insert" on public.evidence_files;
drop policy if exists "cskh evidence insert" on public.evidence_files;
create policy "no direct evidence insert" on public.evidence_files for insert with check(false);

drop policy if exists "shared workspace unc upload" on storage.objects;
create policy "validated workspace unc upload" on storage.objects for insert with check(
  bucket_id='unc' and public.my_role() is not null and
  name ~ '^[^/]+/[^/]+/[0-9a-fA-F-]{36}/[^/]{1,120}$' and
  coalesce(metadata->>'mimetype','') in ('application/pdf','image/jpeg','image/png')
);

