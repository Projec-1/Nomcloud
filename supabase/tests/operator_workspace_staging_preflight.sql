-- Read-only schema/privilege preflight. Run only after an isolated staging
-- project has been explicitly confirmed and the intended migrations applied.
-- This script does not create, update, or delete application data.

begin transaction read only;

do $preflight$
declare
  v_relation text;
  v_definition text;
  v_constraint text;
  v_relations text[] := array[
    'public.platform_cases',
    'public.platform_case_events',
    'public.platform_incidents',
    'public.platform_incident_responders',
    'public.platform_incident_updates'
  ];
  v_private_relations text[] := array[
    'public.school_application_notes',
    'public.school_application_document_events',
    'public.school_application_communications',
    'public.school_application_email_provider_events',
    'public.school_application_events'
  ];
begin
  foreach v_relation in array v_relations loop
    if to_regclass(v_relation) is null then
      raise exception 'Missing expected staging relation: %', v_relation;
    end if;
    if not (
      select c.relrowsecurity
        from pg_class c
       where c.oid = to_regclass(v_relation)
    ) then
      raise exception 'RLS is not enabled on %', v_relation;
    end if;
    if has_table_privilege('anon', v_relation, 'select') then
      raise exception 'Anonymous SELECT is granted on %', v_relation;
    end if;
    if has_table_privilege('anon', v_relation, 'insert')
       or has_table_privilege('anon', v_relation, 'update')
       or has_table_privilege('anon', v_relation, 'delete')
       or has_table_privilege('anon', v_relation, 'truncate') then
      raise exception 'Anonymous mutation privilege is granted on %', v_relation;
    end if;
    if not has_table_privilege('authenticated', v_relation, 'select') then
      raise exception 'Authenticated SELECT is not granted on %', v_relation;
    end if;
    if not exists (
      select 1
        from pg_policies p
       where p.schemaname || '.' || p.tablename = v_relation
         and p.roles @> array['authenticated']::name[]
         and p.cmd in ('SELECT', 'ALL')
         and p.qual ilike '%is_platform_admin%'
    ) then
      raise exception 'Authenticated read lacks an admin-only RLS policy on %', v_relation;
    end if;
  end loop;

  foreach v_relation in array v_private_relations loop
    if to_regclass(v_relation) is null then
      raise exception 'Missing expected staging relation: %', v_relation;
    end if;
    if not (
      select c.relrowsecurity
        from pg_class c
       where c.oid = to_regclass(v_relation)
    ) then
      raise exception 'RLS is not enabled on %', v_relation;
    end if;
    if has_table_privilege('anon', v_relation, 'select') then
      raise exception 'Anonymous SELECT is granted on %', v_relation;
    end if;
    if has_table_privilege('anon', v_relation, 'insert')
       or has_table_privilege('anon', v_relation, 'update')
       or has_table_privilege('anon', v_relation, 'delete')
       or has_table_privilege('anon', v_relation, 'truncate') then
      raise exception 'Anonymous mutation privilege is granted on %', v_relation;
    end if;
    if has_table_privilege('authenticated', v_relation, 'insert')
       or has_table_privilege('authenticated', v_relation, 'update')
       or has_table_privilege('authenticated', v_relation, 'delete')
       or has_table_privilege('authenticated', v_relation, 'truncate') then
      raise exception 'Authenticated direct mutation privilege is granted on %', v_relation;
    end if;
    if v_relation = 'public.school_application_email_provider_events' then
      if has_table_privilege('authenticated', v_relation, 'select') then
        raise exception 'Authenticated SELECT is granted on provider event identifiers';
      end if;
    else
      if not has_table_privilege('authenticated', v_relation, 'select') then
        raise exception 'Authenticated SELECT is not granted on %', v_relation;
      end if;
      if not exists (
        select 1
          from pg_policies p
         where p.schemaname || '.' || p.tablename = v_relation
           and p.roles @> array['authenticated']::name[]
           and p.cmd in ('SELECT', 'ALL')
           and p.qual ilike '%is_platform_admin%'
      ) then
        raise exception 'Authenticated read lacks an admin-only RLS policy on %', v_relation;
      end if;
    end if;
  end loop;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'subscription_plans'
       and policyname = 'subscription_plans_platform_admin_all'
       and roles @> array['authenticated']::name[]
       and cmd in ('SELECT', 'ALL')
       and qual ilike '%is_platform_admin%'
  ) then
    raise exception 'Platform-admin subscription plan policy is missing';
  end if;
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'subscription_plans'
       and cmd in ('SELECT', 'ALL')
       and (qual is null or qual not ilike '%is_platform_admin%')
  ) then
    raise exception 'A subscription-plan read policy is not platform-admin-only';
  end if;
  if has_table_privilege('anon', 'public.subscription_plans', 'select') then
    raise exception 'Anonymous SELECT is granted on subscription_plans';
  end if;
  if not has_table_privilege('authenticated', 'public.subscription_plans', 'select') then
    raise exception 'Authenticated SELECT is not granted on subscription_plans';
  end if;

  v_definition := pg_get_functiondef(
    'public.has_school_billing_role(uuid)'::regprocedure
  );
  if v_definition ilike '%administrator%' then
    raise exception 'School administrator appears in the billing authorization helper';
  end if;
  if v_definition not ilike '%owner%' or v_definition not ilike '%director%' then
    raise exception 'Owner/director billing authorization is not present';
  end if;
  if to_regclass('public.school_subscriptions') is null then
    raise exception 'school_subscriptions relation is missing';
  end if;
  if not (
    select c.relrowsecurity
      from pg_class c
     where c.oid = to_regclass('public.school_subscriptions')
  ) then
    raise exception 'RLS is not enabled on school_subscriptions';
  end if;
  if has_table_privilege('anon', 'public.school_subscriptions', 'select') then
    raise exception 'Anonymous SELECT is granted on school_subscriptions';
  end if;
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'school_subscriptions'
       and cmd in ('SELECT', 'ALL')
       and roles @> array['authenticated']::name[]
       and qual ilike '%has_school_billing_role%'
  ) then
    raise exception 'Owner/director subscription read policy is missing';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.record_school_application_email_delivery(uuid,text,text,text,text)',
       'execute'
     ) then
    raise exception 'Authenticated callers can execute the email delivery recorder';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.record_school_application_email_delivery(uuid,text,text,text,text)',
       'execute'
     ) then
    raise exception 'Trusted service role cannot execute the email delivery recorder';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
   where c.conrelid = 'public.school_application_communications'::regclass
     and c.conname = 'school_application_communications_delivery_consistency';
  if v_constraint is null
     or v_constraint not ilike '%accepted%'
     or v_constraint not ilike '%delivered%'
     or v_constraint not ilike '%unknown%' then
    raise exception 'Email delivery state constraint is missing expected states';
  end if;
end;
$preflight$;

rollback;
