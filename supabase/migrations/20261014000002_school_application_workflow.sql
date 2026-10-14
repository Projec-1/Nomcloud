-- Additive review workflow for platform-level school applications.

alter table public.school_applications
  add column assigned_reviewer uuid references public.profiles (id) on delete set null,
  add column archived_at timestamptz,
  add column priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column review_due_at timestamptz,
  add column document_checklist jsonb not null default '{}'::jsonb
    check (jsonb_typeof(document_checklist) = 'object'),
  add column review_checklist jsonb not null default
    '{"required_fields_complete": false, "contact_valid": false, "school_identity_verified": false}'::jsonb
    check (
      jsonb_typeof(review_checklist) = 'object'
      and jsonb_typeof(review_checklist->'required_fields_complete') = 'boolean'
      and jsonb_typeof(review_checklist->'contact_valid') = 'boolean'
      and jsonb_typeof(review_checklist->'school_identity_verified') = 'boolean'
    ),
  add column review_flags jsonb not null default '{}'::jsonb
    check (jsonb_typeof(review_flags) = 'object'),
  add column onboarding_checklist jsonb not null default '{}'::jsonb
    check (jsonb_typeof(onboarding_checklist) = 'object'),
  add constraint school_applications_onboarding_requires_school_check
    check (status <> 'onboarding' or approved_school_id is not null);

comment on column public.school_applications.assigned_reviewer is
  'Optional reviewer assignment. Only an unrevoked platform administrator may be assigned.';
comment on column public.school_applications.priority is
  'Reviewer-set queue priority; no automated decision is based on it.';
comment on column public.school_applications.document_checklist is
  'Reviewer-maintained document verification data. No document requirements are inferred by the backend.';
comment on column public.school_applications.review_checklist is
  'Persistent reviewer toggles for required fields, contact validity and school identity verification.';
comment on column public.school_applications.review_flags is
  'Human-entered risk flags such as duplicate_suspected or contact_mismatch_suspected; flags never reject an application.';
comment on column public.school_applications.onboarding_checklist is
  'Reviewer-maintained onboarding task map for approved schools; task keys are product-defined.';

create index school_applications_assigned_reviewer_idx
  on public.school_applications (assigned_reviewer, status, created_at desc);
create index school_applications_priority_due_idx
  on public.school_applications (priority, review_due_at)
  where status in ('pending', 'awaiting_information');

create table public.school_application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.school_applications (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 10000),
  mentions uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

comment on table public.school_application_notes is
  'Private reviewer notes. Never exposed to applicants or school tenants.';

create table public.school_application_document_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.school_applications (id) on delete cascade,
  document_id text not null check (length(btrim(document_id)) between 1 and 200),
  state text not null check (state in ('pending', 'verified', 'missing', 'replacement_requested', 'rejected')),
  note text check (note is null or length(note) <= 2000),
  reviewer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.school_application_document_events is
  'Append-only document verification history for a school application.';

create table public.school_application_communications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.school_applications (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  channel text not null default 'email' check (channel in ('email')),
  subject text not null,
  body text not null,
  delivery_state text not null default 'queued'
    check (delivery_state in ('queued', 'sent', 'failed')),
  provider_message_id text,
  delivery_error_code text
    check (delivery_error_code is null or delivery_error_code in ('provider_unconfigured', 'provider_rejected', 'provider_unavailable')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint school_application_communications_delivery_consistency check (
    (delivery_state = 'sent' and delivered_at is not null and delivery_error_code is null)
    or (delivery_state = 'failed' and delivered_at is null and delivery_error_code is not null)
    or (delivery_state = 'queued' and delivered_at is null and delivery_error_code is null)
  )
);

comment on table public.school_application_communications is
  'Private applicant communication history with explicit delivery state. A queued or failed row is not a successful delivery.';

create table public.school_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.school_applications (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  created_at timestamptz not null default now()
);

comment on table public.school_application_events is
  'Private status transition history. Event rows intentionally contain no applicant message or other application PII.';

create index school_application_notes_application_idx
  on public.school_application_notes (application_id, created_at);
create index school_application_document_events_application_idx
  on public.school_application_document_events (application_id, created_at);
create index school_application_communications_application_idx
  on public.school_application_communications (application_id, created_at);
create index school_application_events_application_idx
  on public.school_application_events (application_id, created_at);

alter table public.school_application_notes enable row level security;
alter table public.school_application_document_events enable row level security;
alter table public.school_application_communications enable row level security;
alter table public.school_application_events enable row level security;

create policy school_application_notes_platform_admin_read
  on public.school_application_notes for select to authenticated
  using (public.is_platform_admin());
create policy school_application_document_events_platform_admin_read
  on public.school_application_document_events for select to authenticated
  using (public.is_platform_admin());
create policy school_application_communications_platform_admin_read
  on public.school_application_communications for select to authenticated
  using (public.is_platform_admin());
create policy school_application_events_platform_admin_read
  on public.school_application_events for select to authenticated
  using (public.is_platform_admin());

-- Keep RLS-protected direct SELECT available to platform admins, but force all
-- authenticated mutations through the authorization-checked workflow RPC.
revoke all on public.school_applications from public, anon, authenticated;
grant insert on public.school_applications to anon;
grant select on public.school_applications to authenticated;

revoke all on public.school_application_notes from public, anon, authenticated, service_role;
revoke all on public.school_application_document_events from public, anon, authenticated, service_role;
revoke all on public.school_application_communications from public, anon, authenticated, service_role;
revoke all on public.school_application_events from public, anon, authenticated, service_role;
grant select on public.school_application_notes to authenticated;
grant select on public.school_application_document_events to authenticated;
grant select on public.school_application_communications to authenticated;
grant select on public.school_application_events to authenticated;

create or replace function public.record_school_application_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.school_application_events (
      application_id, actor_id, event_type, from_status, to_status
    )
    values (new.id, auth.uid(), 'status_changed', null, new.status::text);
  elsif old.status is distinct from new.status then
    insert into public.school_application_events (
      application_id, actor_id, event_type, from_status, to_status
    )
    values (new.id, auth.uid(), 'status_changed', old.status::text, new.status::text);
  end if;
  return new;
end;
$$;

create trigger school_applications_record_status_insert
  after insert on public.school_applications
  for each row execute function public.record_school_application_status_event();

create trigger school_applications_record_status_update
  after update of status on public.school_applications
  for each row execute function public.record_school_application_status_event();

-- Keep anonymous application creation pinned to reviewer-owned workflow defaults.
alter policy school_applications_anon_insert
  on public.school_applications
  with check (
    status = 'pending'::public.application_status
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
    and approved_school_id is null
    and assigned_reviewer is null
    and archived_at is null
    and priority = 'normal'
    and review_due_at is null
    and document_checklist = '{}'::jsonb
    and review_checklist = '{"required_fields_complete": false, "contact_valid": false, "school_identity_verified": false}'::jsonb
    and review_flags = '{}'::jsonb
    and onboarding_checklist = '{}'::jsonb
  );

create or replace function public.manage_school_application(
  p_application_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.school_applications%rowtype;
  v_actor uuid := auth.uid();
  v_assignee uuid;
  v_communication_id uuid;
  v_mentions uuid[] := '{}'::uuid[];
  v_item record;
  v_reason text;
  v_action_at timestamptz;
begin
  if v_actor is null or not exists (
    select 1 from public.platform_admins
    where user_id = v_actor and revoked_at is null
  ) then
    raise exception 'Unrevoked platform-admin authority is required' using errcode = '42501';
  end if;
  if p_application_id is null or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Application id and an object payload are required' using errcode = '22023';
  end if;

  select * into v_application
  from public.school_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  case p_action
    when 'request_information' then
      if v_application.status not in ('pending', 'awaiting_information') then
        raise exception 'Application cannot be asked for information in its current status' using errcode = '55000';
      end if;
      if length(btrim(coalesce(p_payload->>'subject', ''))) not between 1 and 200
         or length(btrim(coalesce(p_payload->>'body', ''))) not between 1 and 10000 then
        raise exception 'A subject and message body are required' using errcode = '22023';
      end if;
      update public.school_applications
      set status = 'awaiting_information'
      where id = p_application_id;
      insert into public.school_application_communications (
        application_id, actor_id, subject, body
      ) values (
        p_application_id, v_actor, btrim(p_payload->>'subject'), btrim(p_payload->>'body')
      ) returning id into v_communication_id;

    when 'reject' then
      if v_application.status not in ('pending', 'awaiting_information') then
        raise exception 'Application cannot be rejected in its current status' using errcode = '55000';
      end if;
      v_reason := btrim(coalesce(p_payload->>'reason', ''));
      if length(v_reason) not between 1 and 2000
         or length(btrim(coalesce(p_payload->>'subject', ''))) not between 1 and 200
         or length(btrim(coalesce(p_payload->>'body', ''))) not between 1 and 10000 then
        raise exception 'A rejection reason, subject and message body are required' using errcode = '22023';
      end if;
      update public.school_applications
      set status = 'rejected',
          rejection_reason = v_reason,
          reviewed_by = v_actor,
          reviewed_at = now()
      where id = p_application_id;
      insert into public.school_application_communications (
        application_id, actor_id, subject, body
      ) values (
        p_application_id, v_actor, btrim(p_payload->>'subject'), btrim(p_payload->>'body')
      ) returning id into v_communication_id;

    when 'reopen' then
      if v_application.status not in ('rejected', 'awaiting_information') then
        raise exception 'Only rejected or awaiting-information applications can be reopened' using errcode = '55000';
      end if;
      update public.school_applications
      set status = 'pending',
          rejection_reason = null,
          reviewed_by = v_actor,
          reviewed_at = now()
      where id = p_application_id;

    when 'assign_reviewer' then
      if p_payload ? 'instructions'
         and (jsonb_typeof(p_payload->'instructions') is distinct from 'string'
              or length(p_payload->>'instructions') > 2000) then
        raise exception 'Reviewer instructions must be text of at most 2000 characters' using errcode = '22023';
      end if;
      if nullif(p_payload->>'reviewer_id', '') is null then
        v_assignee := null;
      else
        v_assignee := (p_payload->>'reviewer_id')::uuid;
        if not exists (
          select 1 from public.platform_admins
          where user_id = v_assignee and revoked_at is null
        ) then
          raise exception 'Reviewer must be an unrevoked platform administrator' using errcode = '22023';
        end if;
      end if;
      update public.school_applications
      set assigned_reviewer = v_assignee
      where id = p_application_id;
      if length(btrim(coalesce(p_payload->>'instructions', ''))) > 0 then
        insert into public.school_application_notes (
          application_id, author_id, body
        ) values (
          p_application_id, v_actor,
          'Reviewer assignment context: ' || btrim(p_payload->>'instructions')
        );
      end if;

    when 'change_priority' then
      if coalesce(p_payload->>'priority', '') not in ('low', 'normal', 'high', 'urgent') then
        raise exception 'Priority must be low, normal, high or urgent' using errcode = '22023';
      end if;
      update public.school_applications
      set priority = p_payload->>'priority'
      where id = p_application_id;

    when 'set_due_date' then
      update public.school_applications
      set review_due_at = nullif(p_payload->>'due_at', '')::timestamptz
      where id = p_application_id;

    when 'update_document' then
      if length(btrim(coalesce(p_payload->>'document_id', ''))) not between 1 and 200
         or p_payload->>'state' is null
         or p_payload->>'state' not in ('pending', 'verified', 'missing', 'replacement_requested', 'rejected')
         or (p_payload ? 'note' and p_payload->'note' <> 'null'::jsonb
             and (jsonb_typeof(p_payload->'note') <> 'string'
                  or length(p_payload->>'note') > 2000)) then
        raise exception 'A document id and supported document state are required' using errcode = '22023';
      end if;
      update public.school_applications
      set document_checklist = jsonb_set(
        document_checklist,
        array[btrim(p_payload->>'document_id')],
        coalesce(document_checklist->btrim(p_payload->>'document_id'), '{}'::jsonb)
          || jsonb_build_object('state', p_payload->>'state', 'updated_at', now())
          || case when p_payload ? 'note' then jsonb_build_object('note', p_payload->'note') else '{}'::jsonb end,
        true
      )
      where id = p_application_id;
      insert into public.school_application_document_events (
        application_id, document_id, state, note, reviewer_id
      ) values (
        p_application_id,
        btrim(p_payload->>'document_id'),
        p_payload->>'state',
        nullif(p_payload->>'note', ''),
        v_actor
      );

    when 'update_checklist' then
      if jsonb_typeof(p_payload->'checklist') is distinct from 'object'
         or exists (
           select 1
           from jsonb_each(p_payload->'checklist') item
           where item.key not in (
             'required_fields_complete',
             'contact_valid',
             'school_identity_verified'
           )
             or jsonb_typeof(item.value) is distinct from 'boolean'
         )
         or not (p_payload->'checklist' ?| array[
           'required_fields_complete',
           'contact_valid',
           'school_identity_verified'
         ]) then
        raise exception 'Checklist must contain one or more supported boolean review toggles' using errcode = '22023';
      end if;
      update public.school_applications
      set review_checklist = review_checklist || (p_payload->'checklist')
      where id = p_application_id;

    when 'update_onboarding' then
      if v_application.status not in ('approved', 'onboarding') then
        raise exception 'Onboarding progress is available only after approval' using errcode = '55000';
      end if;
      if jsonb_typeof(p_payload->'checklist') is distinct from 'object' then
        raise exception 'Onboarding checklist must be an object' using errcode = '22023';
      end if;
      update public.school_applications
      set onboarding_checklist = onboarding_checklist || (p_payload->'checklist')
      where id = p_application_id;

    when 'start_onboarding' then
      if v_application.status <> 'approved' or v_application.approved_school_id is null then
        raise exception 'Only an approved application can enter onboarding' using errcode = '55000';
      end if;
      update public.school_applications
      set status = 'onboarding'
      where id = p_application_id;

    when 'send_email' then
      if length(btrim(coalesce(p_payload->>'subject', ''))) not between 1 and 200
         or length(btrim(coalesce(p_payload->>'body', ''))) not between 1 and 10000 then
        raise exception 'A subject and message body are required' using errcode = '22023';
      end if;
      insert into public.school_application_communications (
        application_id, actor_id, subject, body
      ) values (
        p_application_id, v_actor, btrim(p_payload->>'subject'), btrim(p_payload->>'body')
      ) returning id into v_communication_id;

    when 'send_template' then
      if length(btrim(coalesce(p_payload->>'subject', ''))) not between 1 and 200
         or length(btrim(coalesce(p_payload->>'body', ''))) not between 1 and 10000 then
        raise exception 'A resolved template subject and message body are required' using errcode = '22023';
      end if;
      insert into public.school_application_communications (
        application_id, actor_id, subject, body
      ) values (
        p_application_id, v_actor, btrim(p_payload->>'subject'), btrim(p_payload->>'body')
      ) returning id into v_communication_id;

    when 'archive' then
      update public.school_applications
      set archived_at = now()
      where id = p_application_id;

    when 'unarchive' then
      update public.school_applications
      set archived_at = null
      where id = p_application_id;

    when 'set_review_flags' then
      if jsonb_typeof(p_payload->'flags') is distinct from 'object' then
        raise exception 'Review flags must be an object' using errcode = '22023';
      end if;
      for v_item in select key, value from jsonb_each(p_payload->'flags')
      loop
        if v_item.key not in ('duplicate_suspected', 'contact_mismatch_suspected')
           or jsonb_typeof(v_item.value) is distinct from 'boolean' then
          raise exception 'Only boolean duplicate_suspected and contact_mismatch_suspected flags are supported' using errcode = '22023';
        end if;
      end loop;
      update public.school_applications
      set review_flags = review_flags || (p_payload->'flags')
      where id = p_application_id;

    when 'add_note' then
      if length(btrim(coalesce(p_payload->>'body', ''))) not between 1 and 10000 then
        raise exception 'A note body is required' using errcode = '22023';
      end if;
      if p_payload ? 'mentions' and jsonb_typeof(p_payload->'mentions') is distinct from 'array' then
        raise exception 'Mentions must be an array of platform-admin user ids' using errcode = '22023';
      end if;
      for v_item in select value from jsonb_array_elements_text(coalesce(p_payload->'mentions', '[]'::jsonb))
      loop
        v_mentions := array_append(v_mentions, v_item.value::uuid);
      end loop;
      if exists (
        select 1
        from unnest(v_mentions) mention(user_id)
        where not exists (
          select 1 from public.platform_admins
          where user_id = mention.user_id and revoked_at is null
        )
      ) then
        raise exception 'Every mention must identify an unrevoked platform administrator' using errcode = '22023';
      end if;
      insert into public.school_application_notes (application_id, author_id, body, mentions)
      values (p_application_id, v_actor, btrim(p_payload->>'body'), v_mentions);

    else
      raise exception 'Unsupported school-application action' using errcode = '22023';
  end case;

  update public.school_applications
  set updated_at = now()
  where id = p_application_id;

  insert into public.school_application_events (application_id, actor_id, event_type)
  values (p_application_id, v_actor, p_action);

  select updated_at
  into v_action_at
  from public.school_applications
  where id = p_application_id;

  return jsonb_strip_nulls(jsonb_build_object(
    'application_id', p_application_id,
    'action', p_action,
    'status', (select status::text from public.school_applications where id = p_application_id),
    'updated_at', v_action_at,
    'communication_id', v_communication_id
  ));
end;
$$;

comment on function public.manage_school_application(uuid, text, jsonb) is
  'Performs platform-admin-only school application workflow actions. Duplicate and contact-mismatch flags are reviewer-entered signals only and never change application status.';

create or replace function public.record_school_application_email_delivery(
  p_communication_id uuid,
  p_delivery_state text,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.school_application_communications%rowtype;
begin
  if v_actor is null or not exists (
    select 1 from public.platform_admins
    where user_id = v_actor and revoked_at is null
  ) then
    raise exception 'Unrevoked platform-admin authority is required' using errcode = '42501';
  end if;
  if p_delivery_state is null or p_delivery_state not in ('sent', 'failed') then
    raise exception 'Delivery state must be sent or failed' using errcode = '22023';
  end if;
  if (p_delivery_state = 'sent' and p_error_code is not null)
     or (p_delivery_state = 'failed' and (p_error_code is null or p_error_code not in ('provider_unconfigured', 'provider_rejected', 'provider_unavailable'))) then
    raise exception 'Delivery state and error code are inconsistent' using errcode = '22023';
  end if;

  select * into v_row
  from public.school_application_communications
  where id = p_communication_id and direction = 'outbound'
  for update;
  if not found then
    raise exception 'Communication not found' using errcode = 'P0002';
  end if;
  if v_row.delivery_state <> 'queued' then
    if v_row.delivery_state = p_delivery_state then
      return jsonb_build_object('communication_id', v_row.id, 'delivery_state', v_row.delivery_state);
    end if;
    raise exception 'Communication delivery has already been finalized' using errcode = '55000';
  end if;

  update public.school_application_communications
  set delivery_state = p_delivery_state,
      provider_message_id = case when p_delivery_state = 'sent' then p_provider_message_id else null end,
      delivery_error_code = p_error_code,
      delivered_at = case when p_delivery_state = 'sent' then now() else null end
  where id = p_communication_id;

  insert into public.school_application_events (application_id, actor_id, event_type)
  values (
    v_row.application_id,
    v_actor,
    case when p_delivery_state = 'sent' then 'communication_sent' else 'communication_failed' end
  );

  return jsonb_build_object('communication_id', p_communication_id, 'delivery_state', p_delivery_state);
end;
$$;

revoke all on function public.record_school_application_status_event() from public, anon, authenticated, service_role;
revoke all on function public.manage_school_application(uuid, text, jsonb) from public, anon, service_role;
revoke all on function public.record_school_application_email_delivery(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.manage_school_application(uuid, text, jsonb) to authenticated;
grant execute on function public.record_school_application_email_delivery(uuid, text, text, text) to authenticated;
