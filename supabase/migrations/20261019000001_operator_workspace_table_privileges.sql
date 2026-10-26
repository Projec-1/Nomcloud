-- Narrow API-role grants for the Operator Workspace and public application form.
-- Depends on 20261011000002_platform_operations.sql (platform_admins.team) and
-- 20261014000002_school_application_workflow.sql (application workflow columns).
-- This migration does not change RLS policies or service_role privileges.
-- It fails before revoking anything if a target table has a direct PUBLIC ACL;
-- it also stops if an API role inherits another role's privileges. Inspect any
-- such target-specific ACL or membership before deciding how to proceed.

do $privilege_preflight$
declare
  v_table text;
  v_column text;
begin
  foreach v_table in array array[
    'subscription_plans',
    'school_subscriptions',
    'platform_admins',
    'school_applications'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Required relation public.% is missing', v_table;
    end if;

    if exists (
      select 1
        from pg_class c
        cross join lateral aclexplode(
          coalesce(c.relacl, acldefault('r', c.relowner))
        ) acl
       where c.oid = to_regclass(format('public.%I', v_table))
         and acl.grantee = 0
    ) or exists (
      select 1
        from pg_attribute a
        cross join lateral aclexplode(a.attacl) acl
       where a.attrelid = to_regclass(format('public.%I', v_table))
         and a.attnum > 0
         and not a.attisdropped
         and acl.grantee = 0
    ) then
      raise exception
        'PUBLIC has a direct table or column grant on public.%; review service-role impact before revoking it',
        v_table;
    end if;
  end loop;

  if exists (
    select 1
      from pg_roles r
     where r.rolname <> 'anon'
       and pg_has_role('anon', r.oid, 'USAGE')
  ) or exists (
    select 1
      from pg_roles r
     where r.rolname <> 'authenticated'
       and pg_has_role('authenticated', r.oid, 'USAGE')
  ) or exists (
    select 1
      from pg_roles r
     where r.rolname <> 'service_role'
       and pg_has_role('service_role', r.oid, 'USAGE')
  ) then
    raise exception
      'An API role inherits another role; review inherited privileges before revoking table grants';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'platform_admins'
       and column_name = 'team'
  ) then
    raise exception 'Required column public.platform_admins.team is missing';
  end if;

  foreach v_column in array array[
    'school_name',
    'administrator_name',
    'email',
    'phone',
    'school_size_band',
    'country',
    'applicant_position',
    'school_address',
    'campus_count',
    'student_count_band',
    'class_count_band',
    'staff_count_band',
    'curriculum',
    'current_system',
    'reasons',
    'status'
  ] loop
    if not exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'school_applications'
         and column_name = v_column
    ) then
      raise exception 'Required public.school_applications column % is missing', v_column;
    end if;
  end loop;
end;
$privilege_preflight$;

do $column_privilege_cleanup$
declare
  v_table text;
  v_columns text;
begin
  foreach v_table in array array[
    'subscription_plans',
    'school_subscriptions',
    'platform_admins',
    'school_applications'
  ] loop
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
      into v_columns
      from information_schema.columns
     where table_schema = 'public'
       and table_name = v_table;

    if v_columns is null then
      raise exception 'No columns found for required relation public.%', v_table;
    end if;

    execute format(
      'revoke all privileges (%s) on table public.%I from PUBLIC, anon, authenticated',
      v_columns,
      v_table
    );
  end loop;
end;
$column_privilege_cleanup$;

revoke all privileges on table
  public.subscription_plans,
  public.school_subscriptions,
  public.platform_admins,
  public.school_applications
from PUBLIC, anon, authenticated;

-- Subscription rows remain visible only through their existing RLS policies:
-- active school owners/directors, and the separately authorized platform-admin
-- policy. Plan rows remain visible only to platform admins.
grant select on table
  public.subscription_plans,
  public.school_subscriptions,
  public.platform_admins,
  public.school_applications
to authenticated;

-- The public signup form inserts exactly these fields. In particular, it
-- cannot submit reviewer, approval, or workflow metadata through PostgREST.
grant insert (
  school_name,
  administrator_name,
  email,
  phone,
  school_size_band,
  country,
  applicant_position,
  school_address,
  campus_count,
  student_count_band,
  class_count_band,
  staff_count_band,
  curriculum,
  current_system,
  reasons,
  status
) on table public.school_applications to anon;

-- The only direct browser mutation found for platform_admins is team editing.
grant update (team) on table public.platform_admins to authenticated;
