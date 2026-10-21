-- Persistent platform controls, verifiable operational signals, and a
-- provider-neutral financial ledger. No historical invoices or payments are
-- inferred or backfilled by this migration.

create table public.platform_control_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('maintenance', 'feature_flag', 'backup_check')),
  entity_key text not null,
  event_type text not null,
  actor_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table public.platform_maintenance_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  message text not null default 'The school workspace is temporarily unavailable for maintenance.'
    check (length(btrim(message)) between 1 and 500),
  starts_at timestamptz,
  ends_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint platform_maintenance_window_check
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

insert into public.platform_maintenance_settings (singleton)
values (true);

create table public.platform_feature_flags (
  flag_key text primary key
    check (flag_key in (
      'operations_queue',
      'incident_command',
      'school_application_review',
      'billing_ledger'
    )),
  enabled boolean not null default true,
  description text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.platform_feature_flags (flag_key, description) values
  ('operations_queue', 'Enable the database-backed platform operations queue.'),
  ('incident_command', 'Enable manually recorded and automatically detected incidents.'),
  ('school_application_review', 'Enable platform-admin school application review actions.'),
  ('billing_ledger', 'Enable read access to provider-backed platform invoices and payments.')
on conflict (flag_key) do nothing;

create or replace function public.is_platform_feature_enabled(p_flag_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select f.enabled
      from public.platform_feature_flags f
     where f.flag_key = p_flag_key
  ), false);
$$;

create or replace function public.is_platform_maintenance_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.platform_maintenance_settings s
     where s.singleton
       and s.enabled
       and (s.starts_at is null or s.starts_at <= now())
       and (s.ends_at is null or s.ends_at > now())
  );
$$;

create or replace function public.record_platform_control_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_type text;
  v_entity_key text;
  v_event_type text;
begin
  if tg_table_name = 'platform_maintenance_settings' then
    v_entity_type := 'maintenance';
    v_entity_key := 'global';
    v_event_type := case
      when new.enabled and not old.enabled then 'maintenance_enabled'
      when old.enabled and not new.enabled then 'maintenance_disabled'
      else 'maintenance_updated'
    end;
    new.updated_by := auth.uid();
    new.updated_at := now();
  else
    v_entity_type := 'feature_flag';
    v_entity_key := new.flag_key;
    v_event_type := 'feature_flag_updated';
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;

  insert into public.platform_control_events (
    entity_type, entity_key, event_type, actor_id, previous_value, new_value
  ) values (
    v_entity_type,
    v_entity_key,
    v_event_type,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function public.is_platform_feature_enabled(text) from public, anon;
revoke all on function public.is_platform_maintenance_enabled() from public, anon;
revoke all on function public.record_platform_control_change() from public, anon, authenticated, service_role;
grant execute on function public.is_platform_feature_enabled(text) to authenticated, service_role;
grant execute on function public.is_platform_maintenance_enabled() to authenticated, service_role;

create trigger platform_maintenance_settings_audit
  before update on public.platform_maintenance_settings
  for each row execute function public.record_platform_control_change();
create trigger platform_feature_flags_audit
  before update on public.platform_feature_flags
  for each row execute function public.record_platform_control_change();

alter table public.platform_control_events enable row level security;
alter table public.platform_maintenance_settings enable row level security;
alter table public.platform_feature_flags enable row level security;

create policy platform_control_events_operator_select
  on public.platform_control_events for select to authenticated
  using (public.is_platform_admin());
create policy platform_maintenance_settings_operator_select
  on public.platform_maintenance_settings for select to authenticated
  using (public.is_platform_admin());
create policy platform_maintenance_settings_operator_update
  on public.platform_maintenance_settings for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy platform_feature_flags_operator_select
  on public.platform_feature_flags for select to authenticated
  using (public.is_platform_admin());
create policy platform_feature_flags_operator_update
  on public.platform_feature_flags for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.platform_control_events,
  public.platform_maintenance_settings, public.platform_feature_flags
from public, anon, authenticated, service_role;
grant select on public.platform_control_events to authenticated;
grant select, update on public.platform_maintenance_settings to authenticated;
grant select, update (enabled) on public.platform_feature_flags to authenticated;

-- During maintenance, school members lose tenant data access at the shared
-- authorization predicates. Platform administrators retain emergency access;
-- public application submission remains governed by its existing policy.
create or replace function public.is_school_member(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.is_platform_maintenance_enabled() or public.is_platform_admin())
     and exists (
       select 1 from public.memberships m
        where m.user_id = auth.uid()
          and m.school_id = p_school_id
          and m.status = 'active'
     );
$$;

create or replace function public.has_school_staff_role(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.is_platform_maintenance_enabled() or public.is_platform_admin())
     and exists (
       select 1 from public.memberships m
        where m.user_id = auth.uid()
          and m.school_id = p_school_id
          and m.status = 'active'
          and m.role in ('owner', 'director', 'administrator', 'principal', 'teacher')
     );
$$;

create or replace function public.has_school_management_role(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.is_platform_maintenance_enabled() or public.is_platform_admin())
     and exists (
       select 1 from public.memberships m
        where m.user_id = auth.uid()
          and m.school_id = p_school_id
          and m.status = 'active'
          and m.role in ('owner', 'director', 'administrator', 'principal')
     );
$$;

create or replace function public.has_school_admin_role(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.is_platform_maintenance_enabled() or public.is_platform_admin())
     and exists (
       select 1 from public.memberships m
        where m.user_id = auth.uid()
          and m.school_id = p_school_id
          and m.status = 'active'
          and m.role in ('owner', 'director', 'administrator')
     );
$$;

create or replace function public.has_school_billing_role(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.is_platform_maintenance_enabled() or public.is_platform_admin())
     and exists (
       select 1 from public.memberships m
        where m.user_id = auth.uid()
          and m.school_id = p_school_id
          and m.status = 'active'
          and m.role in ('owner', 'director')
     );
$$;

create or replace function public.current_guardian_id(p_school_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.guardian_id
    from public.memberships m
   where (not public.is_platform_maintenance_enabled() or public.is_platform_admin())
     and m.user_id = auth.uid()
     and m.school_id = p_school_id
     and m.status = 'active'
     and m.role = 'guardian'
   limit 1;
$$;

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_platform_maintenance_enabled() and not public.is_platform_admin() then null
    else p.school_id
  end
    from public.profiles p
   where p.id = auth.uid();
$$;

grant execute on function public.is_school_member(uuid) to anon, authenticated, service_role;
grant execute on function public.has_school_staff_role(uuid) to anon, authenticated, service_role;
grant execute on function public.has_school_management_role(uuid) to anon, authenticated, service_role;
grant execute on function public.has_school_admin_role(uuid) to anon, authenticated, service_role;
grant execute on function public.has_school_billing_role(uuid) to authenticated, service_role;
grant execute on function public.current_guardian_id(uuid) to anon, authenticated, service_role;
grant execute on function public.current_school_id() to anon, authenticated, service_role;

-- Feature flags are enforced by RLS and workflow triggers, not just by the
-- client-side switchboard.
drop policy platform_cases_operator_select on public.platform_cases;
drop policy platform_cases_operator_insert on public.platform_cases;
drop policy platform_cases_operator_update on public.platform_cases;
create policy platform_cases_operator_select on public.platform_cases
  for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('operations_queue'));
create policy platform_cases_operator_insert on public.platform_cases
  for insert to authenticated
  with check (public.is_platform_admin() and public.is_platform_feature_enabled('operations_queue'));
create policy platform_cases_operator_update on public.platform_cases
  for update to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('operations_queue'))
  with check (public.is_platform_admin() and public.is_platform_feature_enabled('operations_queue'));

drop policy platform_case_events_operator_select on public.platform_case_events;
drop policy platform_case_events_operator_insert on public.platform_case_events;
create policy platform_case_events_operator_select on public.platform_case_events
  for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('operations_queue'));
create policy platform_case_events_operator_insert on public.platform_case_events
  for insert to authenticated
  with check (public.is_platform_admin() and public.is_platform_feature_enabled('operations_queue'));

alter table public.platform_incidents
  add column detection_source text not null default 'operator'
    check (detection_source in ('operator', 'automated_monitor')),
  add column monitor_service text,
  add constraint platform_incidents_monitor_source_check
    check (
      (detection_source = 'operator' and monitor_service is null)
      or (detection_source = 'automated_monitor' and monitor_service is not null)
    );

create unique index platform_incidents_one_active_monitor_service_idx
  on public.platform_incidents (monitor_service)
  where detection_source = 'automated_monitor' and status <> 'resolved';

drop policy platform_incidents_operator_select on public.platform_incidents;
drop policy platform_incidents_operator_insert on public.platform_incidents;
drop policy platform_incidents_operator_update on public.platform_incidents;
drop policy platform_incident_responders_operator_select on public.platform_incident_responders;
drop policy platform_incident_responders_operator_insert on public.platform_incident_responders;
drop policy platform_incident_responders_operator_delete on public.platform_incident_responders;
drop policy platform_incident_updates_operator_select on public.platform_incident_updates;
drop policy platform_incident_updates_operator_insert on public.platform_incident_updates;

create policy platform_incidents_operator_select on public.platform_incidents
  for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'));
create policy platform_incidents_operator_insert on public.platform_incidents
  for insert to authenticated
  with check (
    public.is_platform_admin()
    and public.is_platform_feature_enabled('incident_command')
    and detection_source = 'operator'
    and monitor_service is null
  );
create policy platform_incidents_operator_update on public.platform_incidents
  for update to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'))
  with check (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'));
create policy platform_incident_responders_operator_select on public.platform_incident_responders
  for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'));
create policy platform_incident_responders_operator_insert on public.platform_incident_responders
  for insert to authenticated
  with check (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'));
create policy platform_incident_responders_operator_delete on public.platform_incident_responders
  for delete to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'));
create policy platform_incident_updates_operator_select on public.platform_incident_updates
  for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'));
create policy platform_incident_updates_operator_insert on public.platform_incident_updates
  for insert to authenticated
  with check (public.is_platform_admin() and public.is_platform_feature_enabled('incident_command'));

revoke update on public.platform_incidents from authenticated;
grant update (status, severity, postmortem, postmortem_reviewed_at, commander_id)
  on public.platform_incidents to authenticated;

drop policy school_applications_platform_admin_select on public.school_applications;
create policy school_applications_platform_admin_select on public.school_applications
  for select to authenticated
  using (
    public.is_platform_admin()
    and public.is_platform_feature_enabled('school_application_review')
  );

drop policy school_application_notes_platform_admin_read on public.school_application_notes;
drop policy school_application_document_events_platform_admin_read on public.school_application_document_events;
drop policy school_application_communications_platform_admin_read on public.school_application_communications;
drop policy school_application_events_platform_admin_read on public.school_application_events;
create policy school_application_notes_platform_admin_read
  on public.school_application_notes for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('school_application_review'));
create policy school_application_document_events_platform_admin_read
  on public.school_application_document_events for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('school_application_review'));
create policy school_application_communications_platform_admin_read
  on public.school_application_communications for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('school_application_review'));
create policy school_application_events_platform_admin_read
  on public.school_application_events for select to authenticated
  using (public.is_platform_admin() and public.is_platform_feature_enabled('school_application_review'));

create or replace function public.block_disabled_school_application_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role'
     and not public.is_platform_feature_enabled('school_application_review') then
    raise exception 'School application review is disabled by a platform feature flag'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.block_disabled_school_application_review() from public, anon, authenticated, service_role;

create trigger school_applications_review_flag_guard
  before update on public.school_applications
  for each row execute function public.block_disabled_school_application_review();

create table public.platform_health_checks (
  id uuid primary key default gen_random_uuid(),
  service_name text not null check (service_name in ('database', 'operator_tables')),
  status text not null check (status in ('healthy', 'degraded', 'unavailable', 'unknown')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  checked_at timestamptz not null default now(),
  constraint platform_health_check_status_consistency check (
    (status = 'healthy' and failure_code is null)
    or (status <> 'healthy' and failure_code is not null)
  )
);

create index platform_health_checks_service_checked_idx
  on public.platform_health_checks (service_name, checked_at desc);

alter table public.platform_health_checks enable row level security;
create policy platform_health_checks_operator_select
  on public.platform_health_checks for select to authenticated
  using (public.is_platform_admin());

revoke all on public.platform_health_checks from public, anon, authenticated, service_role;
grant select on public.platform_health_checks to authenticated;
grant insert on public.platform_health_checks to service_role;

create or replace function public.record_platform_health_checks(p_checks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_service text;
  v_status text;
  v_failure_code text;
  v_duration_ms integer;
  v_check_id uuid;
  v_incident_id uuid;
  v_consecutive_failures integer;
  v_seen text[] := '{}'::text[];
  v_result jsonb := '[]'::jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server execution is required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_checks) is distinct from 'array' then
    raise exception 'Health checks must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_checks) not between 1 and 2 then
    raise exception 'One or two health checks are required' using errcode = '22023';
  end if;

  for v_check in select value from jsonb_array_elements(p_checks)
  loop
    if jsonb_typeof(v_check) is distinct from 'object'
       or v_check - array['service_name', 'status', 'duration_ms', 'failure_code'] <> '{}'::jsonb then
      raise exception 'Health check has an unsupported shape' using errcode = '22023';
    end if;

    v_service := v_check->>'service_name';
    v_status := v_check->>'status';
    v_failure_code := v_check->>'failure_code';
    v_duration_ms := null;
    if v_check ? 'duration_ms' and v_check->'duration_ms' <> 'null'::jsonb then
      if jsonb_typeof(v_check->'duration_ms') is distinct from 'number'
         or (v_check->>'duration_ms') !~ '^[0-9]{1,9}$' then
        raise exception 'Health check duration must be a non-negative integer' using errcode = '22023';
      end if;
      v_duration_ms := (v_check->>'duration_ms')::integer;
    end if;

    if v_service is null
       or v_status is null
       or v_service not in ('database', 'operator_tables')
       or v_status not in ('healthy', 'degraded', 'unavailable', 'unknown')
       or v_service = any(v_seen)
       or (v_status = 'healthy' and v_failure_code is not null)
       or (v_status <> 'healthy' and coalesce(v_failure_code, '') !~ '^[a-z0-9_]{1,80}$') then
      raise exception 'Health check service, status, or failure code is invalid' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_service);

    insert into public.platform_health_checks (
      service_name, status, duration_ms, failure_code
    ) values (
      v_service, v_status, v_duration_ms, v_failure_code
    ) returning id into v_check_id;

    if v_status in ('degraded', 'unavailable') then
      select count(*)::integer into v_consecutive_failures
        from (
          select h.status
            from public.platform_health_checks h
           where h.service_name = v_service
           order by h.checked_at desc, h.id desc
           limit 2
        ) recent
       where recent.status in ('degraded', 'unavailable');

      if v_consecutive_failures = 2
         and public.is_platform_feature_enabled('incident_command') then
        insert into public.platform_incidents (
          title, description, severity, affected_services,
          detection_source, monitor_service
        ) values (
          'Automated health probe: ' || v_service,
          'Two consecutive on-demand health probes reported a failure. Operator review is required.',
          'sev3',
          array[v_service],
          'automated_monitor',
          v_service
        )
        on conflict (monitor_service)
          where detection_source = 'automated_monitor' and status <> 'resolved'
        do nothing
        returning id into v_incident_id;

        if v_incident_id is not null then
          insert into public.platform_incident_updates (incident_id, update_type, body)
          values (
            v_incident_id,
            'update',
            'Automated on-demand probe detected two consecutive failures. This incident requires operator confirmation and resolution.'
          );
        end if;
      end if;
    elsif v_status = 'healthy'
       and public.is_platform_feature_enabled('incident_command') then
      select i.id into v_incident_id
        from public.platform_incidents i
       where i.detection_source = 'automated_monitor'
         and i.monitor_service = v_service
         and i.status <> 'resolved'
       order by i.started_at desc
       limit 1
       for update;

      if v_incident_id is not null then
        update public.platform_incidents
           set status = 'monitoring'
         where id = v_incident_id
           and status <> 'monitoring';
        if found then
          insert into public.platform_incident_updates (incident_id, update_type, body)
          values (
            v_incident_id,
            'recovery_step',
            'A later on-demand health probe succeeded. The incident remains open for operator verification.'
          );
        end if;
      end if;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_check_id,
      'service_name', v_service,
      'status', v_status
    ));
  end loop;
  return v_result;
end;
$$;

revoke all on function public.record_platform_health_checks(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_platform_health_checks(jsonb) to service_role;

create table public.platform_backup_checks (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'supabase' check (provider = 'supabase'),
  status text not null check (status in ('records_found', 'none_found', 'unknown')),
  backup_count integer check (backup_count is null or backup_count >= 0),
  latest_backup_at timestamptz,
  latest_backup_status text check (
    latest_backup_status is null or latest_backup_status ~ '^[A-Za-z0-9 _-]{1,40}$'
  ),
  error_code text check (
    error_code is null or error_code in (
      'management_api_unconfigured',
      'provider_rejected',
      'provider_unavailable',
      'provider_response_invalid'
    )
  ),
  checked_at timestamptz not null default now(),
  constraint platform_backup_check_consistency check (
    (status = 'records_found' and backup_count > 0 and error_code is null)
    or (status = 'none_found' and backup_count = 0 and error_code is null)
    or (status = 'unknown' and error_code is not null)
  )
);

create index platform_backup_checks_checked_idx
  on public.platform_backup_checks (checked_at desc);

alter table public.platform_backup_checks enable row level security;
create policy platform_backup_checks_operator_select
  on public.platform_backup_checks for select to authenticated
  using (public.is_platform_admin());

revoke all on public.platform_backup_checks from public, anon, authenticated, service_role;
grant select on public.platform_backup_checks to authenticated;
grant insert on public.platform_backup_checks to service_role;

create or replace function public.record_platform_backup_check(
  p_status text,
  p_backup_count integer,
  p_latest_backup_at timestamptz,
  p_latest_backup_status text,
  p_error_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server execution is required' using errcode = '42501';
  end if;
  if p_status is null
     or p_status not in ('records_found', 'none_found', 'unknown')
     or (p_status = 'records_found' and (p_backup_count is null or p_backup_count <= 0 or p_error_code is not null))
     or (p_status = 'none_found' and (p_backup_count is distinct from 0 or p_error_code is not null))
     or (p_status = 'unknown' and (
       p_error_code not in (
         'management_api_unconfigured',
         'provider_rejected',
         'provider_unavailable',
         'provider_response_invalid'
       )
     ))
     or (p_latest_backup_status is not null and p_latest_backup_status !~ '^[A-Za-z0-9 _-]{1,40}$')
     or (p_status <> 'records_found' and (p_latest_backup_at is not null or p_latest_backup_status is not null)) then
    raise exception 'Backup evidence fields are inconsistent' using errcode = '22023';
  end if;

  insert into public.platform_backup_checks (
    status, backup_count, latest_backup_at, latest_backup_status, error_code
  ) values (
    p_status, p_backup_count, p_latest_backup_at, p_latest_backup_status, p_error_code
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_platform_backup_check(text, integer, timestamptz, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_platform_backup_check(text, integer, timestamptz, text, text) to service_role;

create table public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique check (length(btrim(invoice_number)) between 1 and 80),
  school_id uuid not null references public.schools(id) on delete restrict,
  subscription_id uuid references public.school_subscriptions(id) on delete restrict,
  billing_period_start date,
  billing_period_end date,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'overdue', 'paid', 'void')),
  issued_at timestamptz,
  due_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_invoice_period_check
    check (
      (billing_period_start is null and billing_period_end is null)
      or (billing_period_start is not null and billing_period_end > billing_period_start)
    )
);

create unique index platform_invoices_subscription_period_unique_idx
  on public.platform_invoices (subscription_id, billing_period_start, billing_period_end)
  where subscription_id is not null
    and billing_period_start is not null
    and billing_period_end is not null;
create index platform_invoices_school_created_idx
  on public.platform_invoices (school_id, created_at desc);
create index platform_invoices_status_due_idx
  on public.platform_invoices (status, due_at);

create table public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.platform_invoices(id) on delete restrict,
  provider text not null check (length(btrim(provider)) between 1 and 80),
  provider_payment_id text,
  provider_event_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending', 'succeeded', 'failed', 'refunded', 'unknown')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint platform_payment_provider_reference_unique unique (provider, provider_payment_id),
  constraint platform_payment_success_evidence_check check (
    status <> 'succeeded'
    or (
      nullif(btrim(provider_payment_id), '') is not null
      and nullif(btrim(provider_event_id), '') is not null
    )
  )
);

create index platform_payments_invoice_created_idx
  on public.platform_payments (invoice_id, created_at desc);
create index platform_payments_status_recorded_idx
  on public.platform_payments (status, recorded_at desc);

create table public.platform_billing_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.platform_invoices(id) on delete restrict,
  payment_id uuid references public.platform_payments(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint platform_billing_event_target_check
    check ((invoice_id is not null) <> (payment_id is not null))
);

create index platform_billing_events_invoice_created_idx
  on public.platform_billing_events (invoice_id, created_at desc);
create index platform_billing_events_payment_created_idx
  on public.platform_billing_events (payment_id, created_at desc);

create or replace function public.validate_platform_invoice_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subscription_id is not null and not exists (
    select 1
      from public.school_subscriptions s
     where s.id = new.subscription_id
       and s.school_id = new.school_id
  ) then
    raise exception 'Invoice subscription must belong to the same school'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.validate_platform_payment_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.platform_invoices i
     where i.id = new.invoice_id
       and i.currency = new.currency
  ) then
    raise exception 'Payment currency must match an existing invoice'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.validate_platform_invoice_paid_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmed_amount bigint;
begin
  if new.status = 'paid' then
    select coalesce(sum(p.amount_minor), 0)::bigint
      into v_confirmed_amount
      from public.platform_payments p
     where p.invoice_id = new.id
       and p.status = 'succeeded'
       and p.currency = new.currency
       and nullif(btrim(p.provider_payment_id), '') is not null
       and nullif(btrim(p.provider_event_id), '') is not null;
    if v_confirmed_amount < new.amount_minor then
      raise exception 'Invoice cannot be marked paid without provider-referenced successful payment records'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_platform_billing_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_event_type text;
  v_from_status text;
  v_to_status text;
  v_metadata jsonb;
begin
  if tg_table_name = 'platform_invoices' then
    v_invoice_id := new.id;
    v_from_status := case when tg_op = 'INSERT' then null else old.status end;
    v_to_status := new.status;
    v_event_type := case
      when tg_op = 'INSERT' then 'invoice_created'
      when old.status is distinct from new.status then 'invoice_status_changed'
      else 'invoice_updated'
    end;
    v_metadata := jsonb_build_object(
      'invoice_number', new.invoice_number,
      'amount_minor', new.amount_minor,
      'currency', new.currency
    );
  else
    v_from_status := case when tg_op = 'INSERT' then null else old.status end;
    v_to_status := new.status;
    v_event_type := case
      when tg_op = 'INSERT' then 'payment_recorded'
      when old.status is distinct from new.status then 'payment_status_changed'
      else 'payment_updated'
    end;
    v_metadata := jsonb_build_object(
      'provider', new.provider,
      'amount_minor', new.amount_minor,
      'currency', new.currency
    );
  end if;

  if tg_table_name = 'platform_payments' then
    insert into public.platform_billing_events (
      payment_id, event_type, from_status, to_status, actor_id, metadata
    ) values (
      new.id, v_event_type, v_from_status, v_to_status, auth.uid(), v_metadata
    );
  else
    insert into public.platform_billing_events (
      invoice_id, event_type, from_status, to_status, actor_id, metadata
    ) values (
      v_invoice_id, v_event_type, v_from_status, v_to_status, auth.uid(), v_metadata
    );
  end if;
  return new;
end;
$$;

create or replace function public.set_platform_invoice_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function public.prevent_platform_billing_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Billing ledger rows are immutable; use a status transition instead'
    using errcode = '55000';
end;
$$;

create or replace function public.prevent_platform_billing_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Billing audit events are append-only' using errcode = '55000';
end;
$$;

revoke all on function public.record_platform_billing_event() from public, anon, authenticated, service_role;
revoke all on function public.validate_platform_invoice_relationship() from public, anon, authenticated, service_role;
revoke all on function public.validate_platform_payment_relationship() from public, anon, authenticated, service_role;
revoke all on function public.validate_platform_invoice_paid_evidence() from public, anon, authenticated, service_role;
revoke all on function public.set_platform_invoice_creator() from public, anon, authenticated, service_role;
revoke all on function public.prevent_platform_billing_delete() from public, anon, authenticated, service_role;
revoke all on function public.prevent_platform_billing_event_mutation() from public, anon, authenticated, service_role;

create trigger platform_invoices_set_creator
  before insert on public.platform_invoices
  for each row execute function public.set_platform_invoice_creator();
create trigger platform_invoices_validate_relationship
  before insert or update of school_id, subscription_id on public.platform_invoices
  for each row execute function public.validate_platform_invoice_relationship();
create trigger platform_invoices_require_payment_evidence
  before insert or update of status on public.platform_invoices
  for each row execute function public.validate_platform_invoice_paid_evidence();
create trigger platform_payments_validate_relationship
  before insert or update of invoice_id, currency on public.platform_payments
  for each row execute function public.validate_platform_payment_relationship();
create trigger platform_invoices_audit
  after insert or update on public.platform_invoices
  for each row execute function public.record_platform_billing_event();
create trigger platform_payments_audit
  after insert or update on public.platform_payments
  for each row execute function public.record_platform_billing_event();
create trigger platform_invoices_no_delete
  before delete on public.platform_invoices
  for each row execute function public.prevent_platform_billing_delete();
create trigger platform_payments_no_delete
  before delete on public.platform_payments
  for each row execute function public.prevent_platform_billing_delete();
create trigger platform_billing_events_append_only
  before update or delete on public.platform_billing_events
  for each row execute function public.prevent_platform_billing_event_mutation();

alter table public.platform_invoices enable row level security;
alter table public.platform_payments enable row level security;
alter table public.platform_billing_events enable row level security;

create policy platform_invoices_authorized_select
  on public.platform_invoices for select to authenticated
  using (
    public.is_platform_feature_enabled('billing_ledger')
    and (
      public.is_platform_admin()
      or public.has_school_billing_role(school_id)
    )
  );
create policy platform_payments_authorized_select
  on public.platform_payments for select to authenticated
  using (
    public.is_platform_feature_enabled('billing_ledger')
    and exists (
      select 1 from public.platform_invoices i
       where i.id = platform_payments.invoice_id
    )
  );
create policy platform_billing_events_authorized_select
  on public.platform_billing_events for select to authenticated
  using (
    public.is_platform_feature_enabled('billing_ledger')
    and (
      public.is_platform_admin()
      or exists (
        select 1
          from public.platform_invoices i
         where i.id = platform_billing_events.invoice_id
           and public.has_school_billing_role(i.school_id)
      )
      or exists (
        select 1
          from public.platform_payments p
          join public.platform_invoices i on i.id = p.invoice_id
         where p.id = platform_billing_events.payment_id
           and public.has_school_billing_role(i.school_id)
      )
    )
  );

revoke all on public.platform_invoices, public.platform_payments,
  public.platform_billing_events from public, anon, authenticated, service_role;
grant select on public.platform_invoices, public.platform_payments,
  public.platform_billing_events to authenticated;
grant select, insert, update on public.platform_invoices, public.platform_payments to service_role;
grant select, insert on public.platform_billing_events to service_role;

create trigger platform_invoices_set_updated_at
  before update on public.platform_invoices
  for each row execute function public.set_updated_at();
