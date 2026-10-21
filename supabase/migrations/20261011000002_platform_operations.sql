-- Internal platform case management and incident command. Contact-message
-- cases retain only a source ID and status; message content is not copied.
-- Version 20261011000002 avoids the local subscription-billing migration's
-- duplicate 20261011000001 version.

alter table public.platform_admins
  add column team text;

create table public.platform_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  case_type text not null
    check (case_type in ('support', 'account', 'billing', 'technical', 'school_request', 'incident', 'other')),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'waiting', 'escalated', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  severity text not null default 'sev3'
    check (severity in ('sev1', 'sev2', 'sev3', 'sev4')),
  description text,
  school_id uuid references public.schools(id) on delete set null,
  assigned_operator_id uuid references public.platform_admins(id) on delete set null,
  team text,
  due_at timestamptz,
  requires_approval boolean not null default false,
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required', 'pending', 'approved', 'declined')),
  source_contact_message_id uuid unique references public.contact_messages(id) on delete set null,
  resolution text,
  created_by uuid references public.profiles(id) on delete set null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_cases_approval_consistency check (
    (requires_approval and approval_status <> 'not_required')
    or (not requires_approval and approval_status = 'not_required')
  ),
  constraint platform_cases_pending_approval_open check (
    approval_status <> 'pending' or status not in ('resolved', 'closed')
  )
);

create index platform_cases_queue_idx
  on public.platform_cases (status, priority, due_at, updated_at desc);
create index platform_cases_assignee_idx
  on public.platform_cases (assigned_operator_id, status, due_at);
create index platform_cases_school_idx
  on public.platform_cases (school_id, created_at desc);

create or replace function public.set_platform_case_response_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('investigating', 'escalated') then
      new.first_response_at := coalesce(new.first_response_at, now());
    end if;
    if new.status in ('resolved', 'closed') then
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    return new;
  end if;

  if old.first_response_at is null and new.status in ('investigating', 'escalated') then
    new.first_response_at := now();
  end if;
  if old.status not in ('resolved', 'closed') and new.status in ('resolved', 'closed') then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif old.status in ('resolved', 'closed') and new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.set_platform_case_response_times() from public, anon, authenticated;

create trigger platform_cases_set_response_times
  before insert or update on public.platform_cases
  for each row execute function public.set_platform_case_response_times();

create trigger platform_cases_set_updated_at
  before update on public.platform_cases
  for each row execute function public.set_updated_at();

create or replace function public.validate_platform_operations_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'platform_cases' then
    if new.assigned_operator_id is not null
        and not exists (
          select 1 from public.platform_admins pa
           where pa.id = new.assigned_operator_id and pa.revoked_at is null
        ) then
      raise exception 'Assigned operator must have active platform access' using errcode = '23514';
    end if;
  elsif tg_table_name = 'platform_incidents' then
    if new.commander_id is not null
        and not exists (
          select 1 from public.platform_admins pa
           where pa.id = new.commander_id and pa.revoked_at is null
        ) then
      raise exception 'Incident commander must have active platform access' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_platform_operations_assignment() from public, anon, authenticated;

create trigger platform_cases_validate_assignment
  before insert or update of assigned_operator_id on public.platform_cases
  for each row execute function public.validate_platform_operations_assignment();

create or replace function public.validate_platform_case_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'closed') and nullif(btrim(new.resolution), '') is null then
    raise exception 'A resolution summary is required before completing a case' using errcode = '23514';
  end if;
  if new.status in ('resolved', 'closed') and new.approval_status = 'pending' then
    raise exception 'Resolve the pending approval before completing the case' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_platform_case_completion() from public, anon, authenticated;

create trigger platform_cases_validate_completion
  before insert or update of status, resolution, approval_status on public.platform_cases
  for each row execute function public.validate_platform_case_completion();

create table public.platform_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.platform_cases(id) on delete cascade,
  event_type text not null
    check (event_type in ('created', 'status_changed', 'assignment_changed', 'details_changed', 'approval_changed', 'resolution', 'note', 'evidence')),
  body text not null,
  evidence_reference text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint platform_case_event_evidence_check check (
    (event_type = 'evidence' and evidence_reference is not null)
    or (event_type <> 'evidence' and evidence_reference is null)
  )
);

create or replace function public.set_platform_operations_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actor_id := auth.uid();
  return new;
end;
$$;

revoke all on function public.set_platform_operations_actor() from public, anon, authenticated;

create trigger platform_case_events_set_actor
  before insert on public.platform_case_events
  for each row execute function public.set_platform_operations_actor();

create index platform_case_events_case_created_idx
  on public.platform_case_events (case_id, created_at);

create table public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  severity text not null check (severity in ('sev1', 'sev2', 'sev3', 'sev4')),
  status text not null default 'investigating'
    check (status in ('investigating', 'mitigating', 'monitoring', 'resolved')),
  affected_services text[] not null default '{}',
  commander_id uuid references public.platform_admins(id) on delete set null,
  linked_case_id uuid references public.platform_cases(id) on delete set null,
  postmortem text,
  postmortem_reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index platform_incidents_status_started_idx
  on public.platform_incidents (status, started_at desc);

create trigger platform_incidents_set_updated_at
  before update on public.platform_incidents
  for each row execute function public.set_updated_at();

create or replace function public.set_platform_incident_resolved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'resolved' then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif tg_op = 'UPDATE' then
    if old.status = 'resolved' then
      new.resolved_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_platform_incident_resolved_at() from public, anon, authenticated;

create trigger platform_incidents_set_resolved_at
  before insert or update on public.platform_incidents
  for each row execute function public.set_platform_incident_resolved_at();

create trigger platform_incidents_validate_commander
  before insert or update of commander_id on public.platform_incidents
  for each row execute function public.validate_platform_operations_assignment();

create table public.platform_incident_responders (
  incident_id uuid not null references public.platform_incidents(id) on delete cascade,
  operator_id uuid not null references public.platform_admins(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (incident_id, operator_id)
);

create table public.platform_incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.platform_incidents(id) on delete cascade,
  update_type text not null check (update_type in ('update', 'recovery_step', 'postmortem')),
  body text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create trigger platform_incident_updates_set_actor
  before insert on public.platform_incident_updates
  for each row execute function public.set_platform_operations_actor();

create or replace function public.set_platform_operations_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.set_platform_operations_creator() from public, anon, authenticated;

create trigger platform_cases_set_creator
  before insert on public.platform_cases
  for each row execute function public.set_platform_operations_creator();
create trigger platform_incidents_set_creator
  before insert on public.platform_incidents
  for each row execute function public.set_platform_operations_creator();

create index platform_incident_updates_incident_created_idx
  on public.platform_incident_updates (incident_id, created_at);

alter table public.platform_cases enable row level security;
alter table public.platform_case_events enable row level security;
alter table public.platform_incidents enable row level security;
alter table public.platform_incident_responders enable row level security;
alter table public.platform_incident_updates enable row level security;

create policy platform_cases_operator_select on public.platform_cases
  for select to authenticated using (public.is_platform_admin());
create policy platform_cases_operator_insert on public.platform_cases
  for insert to authenticated with check (public.is_platform_admin());
create policy platform_cases_operator_update on public.platform_cases
  for update to authenticated using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy platform_case_events_operator_select on public.platform_case_events
  for select to authenticated using (public.is_platform_admin());
create policy platform_case_events_operator_insert on public.platform_case_events
  for insert to authenticated with check (public.is_platform_admin());

create policy platform_incidents_operator_select on public.platform_incidents
  for select to authenticated using (public.is_platform_admin());
create policy platform_incidents_operator_insert on public.platform_incidents
  for insert to authenticated with check (public.is_platform_admin());
create policy platform_incidents_operator_update on public.platform_incidents
  for update to authenticated using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy platform_incident_responders_operator_select on public.platform_incident_responders
  for select to authenticated using (public.is_platform_admin());
create policy platform_incident_responders_operator_insert on public.platform_incident_responders
  for insert to authenticated with check (public.is_platform_admin());
create policy platform_incident_responders_operator_delete on public.platform_incident_responders
  for delete to authenticated using (public.is_platform_admin());

create policy platform_incident_updates_operator_select on public.platform_incident_updates
  for select to authenticated using (public.is_platform_admin());
create policy platform_incident_updates_operator_insert on public.platform_incident_updates
  for insert to authenticated with check (public.is_platform_admin());

revoke all on public.platform_cases, public.platform_case_events,
  public.platform_incidents, public.platform_incident_responders,
  public.platform_incident_updates from public, anon, authenticated;
grant select, insert, update on public.platform_cases to authenticated;
grant select, insert on public.platform_case_events to authenticated;
grant select, insert, update on public.platform_incidents to authenticated;
grant select, insert, delete on public.platform_incident_responders to authenticated;
grant select, insert on public.platform_incident_updates to authenticated;
revoke update on public.platform_admins from authenticated;
grant update (team) on public.platform_admins to authenticated;

create or replace function public.record_platform_operations_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_action text;
  v_summary text;
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_email extensions.citext;
begin
  v_actor_role := case when v_actor is null then 'system' else 'platform_operator' end;

  select p.email into v_email
    from public.profiles p
   where p.id = v_actor;

  if tg_table_name = 'platform_case_events' then
    v_entity_type := 'platform_case';
    v_entity_id := new.case_id;
    v_action := 'platform_case_' || new.event_type;
    v_summary := 'Operator case activity recorded';
  elsif tg_table_name = 'platform_incident_updates' then
    v_entity_type := 'platform_incident';
    v_entity_id := new.incident_id;
    v_action := 'platform_incident_' || new.update_type;
    v_summary := 'Incident command update recorded';
  elsif tg_table_name = 'platform_cases' then
    v_entity_type := 'platform_case';
    v_entity_id := new.id;
    v_action := case
      when tg_op = 'INSERT' and new.source_contact_message_id is not null then 'platform_case_intake_created'
      when tg_op = 'INSERT' then 'platform_case_created'
      else 'platform_case_updated'
    end;
    v_summary := case
      when tg_op = 'INSERT' and new.source_contact_message_id is not null then 'Contact enquiry added to operations queue'
      when tg_op = 'INSERT' then 'Operator case created'
      else 'Operator case updated'
    end;
  elsif tg_table_name = 'platform_incidents' then
    v_entity_type := 'platform_incident';
    v_entity_id := new.id;
    v_action := case when tg_op = 'INSERT' then 'platform_incident_created' else 'platform_incident_updated' end;
    v_summary := case when tg_op = 'INSERT' then 'Platform incident opened' else 'Platform incident updated' end;
  else
    v_entity_type := 'platform_operator';
    v_entity_id := new.id;
    v_action := 'platform_operator_team_updated';
    v_summary := 'Operator team assignment updated';
  end if;

  insert into public.audit_logs (
    actor_user_id, actor_role, actor_email, action, entity_type, entity_id, summary
  ) values (
    v_actor, v_actor_role, v_email, v_action, v_entity_type, v_entity_id, v_summary
  );

  return new;
end;
$$;

revoke all on function public.record_platform_operations_audit() from public, anon, authenticated;

create trigger platform_case_events_audit
  after insert on public.platform_case_events
  for each row execute function public.record_platform_operations_audit();
create trigger platform_incident_updates_audit
  after insert on public.platform_incident_updates
  for each row execute function public.record_platform_operations_audit();
create trigger platform_cases_audit
  after insert or update on public.platform_cases
  for each row execute function public.record_platform_operations_audit();
create trigger platform_incidents_audit
  after insert or update on public.platform_incidents
  for each row execute function public.record_platform_operations_audit();
create trigger platform_operator_team_audit
  after update of team on public.platform_admins
  for each row when (old.team is distinct from new.team)
  execute function public.record_platform_operations_audit();

create or replace function public.log_platform_case_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.platform_case_events (case_id, event_type, body, actor_id)
    values (new.id, 'created', 'Case opened', auth.uid());
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.platform_case_events (case_id, event_type, body, actor_id)
    values (new.id, 'status_changed', format('Status changed to %s', new.status), auth.uid());
  end if;
  if old.assigned_operator_id is distinct from new.assigned_operator_id
      or old.team is distinct from new.team then
    insert into public.platform_case_events (case_id, event_type, body, actor_id)
    values (new.id, 'assignment_changed', 'Case assignment updated', auth.uid());
  end if;
  if old.priority is distinct from new.priority
      or old.severity is distinct from new.severity
      or old.due_at is distinct from new.due_at then
    insert into public.platform_case_events (case_id, event_type, body, actor_id)
    values (new.id, 'details_changed', 'Priority, severity, or deadline updated', auth.uid());
  end if;
  if old.approval_status is distinct from new.approval_status then
    insert into public.platform_case_events (case_id, event_type, body, actor_id)
    values (new.id, 'approval_changed', format('Approval %s', new.approval_status), auth.uid());
  end if;
  if old.resolution is distinct from new.resolution and new.resolution is not null then
    insert into public.platform_case_events (case_id, event_type, body, actor_id)
    values (new.id, 'resolution', 'Resolution recorded', auth.uid());
  end if;
  if old.title is distinct from new.title or old.description is distinct from new.description then
    insert into public.platform_case_events (case_id, event_type, body, actor_id)
    values (new.id, 'details_changed', 'Case details updated', auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.log_platform_case_change() from public, anon, authenticated;
create trigger platform_cases_log_changes
  after insert or update on public.platform_cases
  for each row execute function public.log_platform_case_change();

create or replace function public.log_platform_incident_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.platform_incident_updates (incident_id, update_type, body, actor_id)
    values (new.id, 'update', 'Incident command opened', auth.uid());
    return new;
  end if;
  if old.status is distinct from new.status then
    insert into public.platform_incident_updates (incident_id, update_type, body, actor_id)
    values (new.id, 'update', format('Incident status changed to %s', new.status), auth.uid());
  end if;
  if old.postmortem is distinct from new.postmortem and new.postmortem is not null then
    insert into public.platform_incident_updates (incident_id, update_type, body, actor_id)
    values (new.id, 'postmortem', 'Post-incident review updated', auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.log_platform_incident_change() from public, anon, authenticated;
create trigger platform_incidents_log_changes
  after insert or update on public.platform_incidents
  for each row execute function public.log_platform_incident_change();

create or replace function public.sync_contact_message_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.platform_cases (
      title, case_type, status, priority, description, source_contact_message_id, resolution,
      created_at, resolved_at
    ) values (
      'Contact enquiry',
      'support',
      case when new.status = 'handled' then 'resolved' else 'open' end,
      'normal',
      null,
      new.id,
      case when new.status = 'handled' then 'Previously handled contact enquiry' else null end,
      new.created_at,
      new.handled_at
    )
    on conflict (source_contact_message_id) do nothing;
    return new;
  end if;

  if old.status is distinct from new.status then
    update public.platform_cases
       set status = case when new.status = 'handled' then 'resolved' else 'open' end,
           resolution = case
             when new.status = 'handled' then coalesce(resolution, 'Handled from Requests & Reviews')
             else resolution
           end,
           resolved_at = case when new.status = 'handled' then coalesce(new.handled_at, now()) else null end
     where source_contact_message_id = new.id
       and status is distinct from case when new.status = 'handled' then 'resolved' else 'open' end;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_contact_message_case() from public, anon, authenticated;

create trigger contact_messages_sync_platform_case
  after insert or update of status on public.contact_messages
  for each row execute function public.sync_contact_message_case();

create or replace function public.log_platform_responder_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident_id uuid;
  v_operator_id uuid;
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_email extensions.citext;
begin
  v_actor_role := case when v_actor is null then 'system' else 'platform_operator' end;

  if tg_op = 'DELETE' then
    v_incident_id := old.incident_id;
    v_operator_id := old.operator_id;
  else
    v_incident_id := new.incident_id;
    v_operator_id := new.operator_id;
  end if;

  select p.email into v_email
    from public.profiles p
   where p.id = v_actor;

  insert into public.audit_logs (
    actor_user_id, actor_role, actor_email, action, entity_type, entity_id, summary, changes
  ) values (
    v_actor, v_actor_role, v_email,
    case when tg_op = 'INSERT' then 'platform_incident_responder_assigned' else 'platform_incident_responder_removed' end,
    'platform_incident', v_incident_id, 'Incident responder assignment changed',
    jsonb_build_object(
      'operator_id', v_operator_id,
      'operation', case when tg_op = 'INSERT' then 'assigned' else 'removed' end
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.log_platform_responder_change() from public, anon, authenticated;

create trigger platform_incident_responders_audit
  after insert or delete on public.platform_incident_responders
  for each row execute function public.log_platform_responder_change();

create or replace function public.set_platform_incident_responders(
  p_incident_id uuid,
  p_operator_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform operator access required' using errcode = '42501';
  end if;
  if p_incident_id is null or not exists (
    select 1 from public.platform_incidents pi where pi.id = p_incident_id
  ) then
    raise exception 'Incident not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1
      from unnest(coalesce(p_operator_ids, '{}'::uuid[])) requested(id)
     where not exists (
       select 1 from public.platform_admins pa
        where pa.id = requested.id and pa.revoked_at is null
     )
  ) then
    raise exception 'Responders must be active platform operators' using errcode = '23514';
  end if;
  delete from public.platform_incident_responders
   where incident_id = p_incident_id;
  insert into public.platform_incident_responders (incident_id, operator_id)
  select p_incident_id, requested.id
    from (
      select distinct id from unnest(coalesce(p_operator_ids, '{}'::uuid[])) requested(id)
    ) requested;
end;
$$;

revoke all on function public.set_platform_incident_responders(uuid, uuid[]) from public, anon;
grant execute on function public.set_platform_incident_responders(uuid, uuid[]) to authenticated;
