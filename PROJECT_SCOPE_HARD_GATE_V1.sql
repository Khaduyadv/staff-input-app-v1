-- Current real-data deployment scope. Change only through a reviewed migration
-- and a separate versioned deployment; never from browser input.
create or replace function public.active_workspace_project()
returns text
language sql
immutable
as $$ select 'OCEAN_CITY'::text $$;

drop policy if exists "shared workspace assignment read" on public.assignments;
create policy "shared workspace assignment read" on public.assignments
for select using (public.my_role() is not null and project_id = public.active_workspace_project());

drop policy if exists "shared workspace debt read" on public.shop_debt_snapshot;
create policy "shared workspace debt read" on public.shop_debt_snapshot
for select using (public.my_role() is not null and project_id = public.active_workspace_project());

drop policy if exists "shared workspace event read" on public.staff_events;
create policy "shared workspace event read" on public.staff_events
for select using (public.my_role() is not null and project_id = public.active_workspace_project());

drop policy if exists "shared workspace evidence read" on public.evidence_files;
create policy "shared workspace evidence read" on public.evidence_files
for select using (public.my_role() is not null and project_id = public.active_workspace_project());

drop policy if exists "shared workspace unc read" on storage.objects;
create policy "shared workspace unc read" on storage.objects
for select using (
  bucket_id = 'unc'
  and public.my_role() is not null
  and name like public.active_workspace_project() || '/%'
);

drop policy if exists "validated workspace unc upload" on storage.objects;
create policy "validated workspace unc upload" on storage.objects
for insert with check (
  bucket_id = 'unc'
  and public.my_role() is not null
  and name like public.active_workspace_project() || '/%'
  and name ~ '^[^/]+/[^/]+/[0-9a-fA-F-]{36}/[^/]{1,120}$'
  and coalesce(metadata->>'mimetype','') in ('application/pdf','image/jpeg','image/png')
);

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
  if p_project_id <> public.active_workspace_project() then raise exception 'PROJECT_SCOPE_VIOLATION'; end if;
  if length(coalesce(p_shop_id,''))=0 or length(p_shop_id)>160 then raise exception 'INVALID_IDENTITY'; end if;
  if p_event_type not in ('PLAN_CREATED','PLAN_CHANGED','PLAN_CANCELLED','PAYMENT_REPORTED','EVIDENCE_UPLOADED','NOTE_ADDED') then raise exception 'INVALID_EVENT_TYPE'; end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 1000000000000) then raise exception 'INVALID_AMOUNT'; end if;
  if length(coalesce(p_note,''))>2000 or length(coalesce(p_cancelled_reason,''))>500 then raise exception 'TEXT_TOO_LONG'; end if;
  if not exists(select 1 from public.assignments a where a.project_id=public.active_workspace_project() and a.shop_id=p_shop_id) then raise exception 'SHOP_NOT_ASSIGNED'; end if;
  if (select count(*) from public.staff_events e where e.created_by=auth.uid() and e.event_time > now()-interval '1 minute') >= 30 then raise exception 'RATE_LIMITED'; end if;
  insert into public.staff_events(project_id,shop_id,event_type,created_by,amount,expected_date,signal_type,note,supersedes_event_id,cancelled_reason,payload)
  values(public.active_workspace_project(),p_shop_id,p_event_type,auth.uid(),p_amount,p_expected_date,p_signal_type,p_note,p_supersedes_event_id,p_cancelled_reason,coalesce(p_payload,'{}'::jsonb))
  returning * into r;
  return r;
end;
$$;

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
  if p_project_id <> public.active_workspace_project() then raise exception 'PROJECT_SCOPE_VIOLATION'; end if;
  select * into e from public.staff_events where event_id=p_payment_event_id and project_id=public.active_workspace_project() and shop_id=p_shop_id;
  if not found or e.event_type <> 'PAYMENT_REPORTED' then raise exception 'PAYMENT_EVENT_REQUIRED'; end if;
  if left(p_storage_path, length(public.active_workspace_project()||'/'||p_shop_id||'/'||p_payment_event_id::text||'/')) <> public.active_workspace_project()||'/'||p_shop_id||'/'||p_payment_event_id::text||'/' or array_length(string_to_array(p_storage_path,'/'),1) <> 4 or length(split_part(p_storage_path,'/',4))=0 or length(split_part(p_storage_path,'/',4))>120 then raise exception 'INVALID_STORAGE_PATH'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_size_bytes < 1 or p_size_bytes > 10485760 then raise exception 'INVALID_EVIDENCE'; end if;
  insert into public.evidence_files(payment_event_id,project_id,shop_id,storage_path,original_filename,mime_type,size_bytes,uploaded_by)
  values(p_payment_event_id,public.active_workspace_project(),p_shop_id,p_storage_path,p_original_filename,p_mime_type,p_size_bytes,auth.uid()) returning * into r;
  return r;
end;
$$;
