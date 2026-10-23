import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrations = [
  '20261011000001_subscription_billing_access.sql',
  '20261011000002_platform_operations.sql',
  '20261014000001_school_application_statuses.sql',
  '20261014000002_school_application_workflow.sql',
  '20261014000003_approve_school_application_awaiting_information.sql',
  '20261019000001_operator_workspace_table_privileges.sql',
  '20261019200000_platform_controls_health_backup_billing.sql',
  '20261022100000_restrict_api_function_execution.sql',
  '20261023120000_subscription_checkout.sql',
]

const ids = {
  owner: '10000000-0000-4000-8000-000000000001',
  director: '10000000-0000-4000-8000-000000000002',
  administrator: '10000000-0000-4000-8000-000000000003',
  revokedOwner: '10000000-0000-4000-8000-000000000004',
  platformAdmin: '10000000-0000-4000-8000-000000000005',
  secondOperator: '10000000-0000-4000-8000-000000000006',
  applicant: '10000000-0000-4000-8000-000000000007',
  platformGrant: '20000000-0000-4000-8000-000000000001',
  secondGrant: '20000000-0000-4000-8000-000000000002',
  ownerSchool: '30000000-0000-4000-8000-000000000001',
  directorSchool: '30000000-0000-4000-8000-000000000002',
  adminSchool: '30000000-0000-4000-8000-000000000003',
  revokedSchool: '30000000-0000-4000-8000-000000000004',
  plan: '40000000-0000-4000-8000-000000000001',
  ownerSubscription: '50000000-0000-4000-8000-000000000001',
  directorSubscription: '50000000-0000-4000-8000-000000000002',
  adminSubscription: '50000000-0000-4000-8000-000000000003',
  revokedSubscription: '50000000-0000-4000-8000-000000000004',
}

const bootstrap = `
create role anon;
create role authenticated;
create role service_role;
alter role service_role bypassrls;
create schema auth;
create schema extensions;
create domain extensions.citext as text;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

create function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role()
returns text language sql stable
as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create table auth.users (id uuid primary key, email text not null);

create table public.platform_admins (
  id uuid primary key,
  user_id uuid not null unique,
  revoked_at timestamptz
);
create table public.profiles (
  id uuid primary key,
  school_id uuid,
  full_name text not null,
  email extensions.citext,
  phone text
);
create table public.schools (
  id uuid primary key,
  shortcode text not null unique,
  name text not null,
  address text,
  phone text,
  email text,
  country text,
  status text not null default 'active'
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  school_id uuid not null references public.schools(id),
  role text not null,
  status text not null,
  invited_by uuid,
  guardian_id uuid,
  unique (user_id, school_id, role)
);
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_monthly numeric(12,2) not null,
  price_annual numeric(12,2),
  currency char(3) not null default 'USD',
  max_students integer,
  features jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.school_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  plan_id uuid not null references public.subscription_plans(id),
  status text not null,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index school_subscriptions_school_id_live_idx
  on public.school_subscriptions (school_id) where cancelled_at is null;
create table public.contact_messages (
  id uuid primary key,
  name text not null,
  email text not null,
  topic text,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_role text,
  actor_email extensions.citext,
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  changes jsonb
);
create type public.application_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create table public.school_applications (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  administrator_name text not null,
  email extensions.citext not null,
  phone text,
  school_size_band text,
  country text,
  applicant_position text,
  school_address text,
  campus_count integer,
  student_count_band text,
  class_count_band text,
  staff_count_band text,
  curriculum text,
  current_system text,
  reasons text,
  status public.application_status not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  approved_school_id uuid references public.schools(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and revoked_at is null
  )
$$;
create function public.has_school_billing_role(p_school_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and school_id = p_school_id
      and status = 'active' and role in ('owner', 'director')
  )
$$;
create function public.is_school_member(p_school_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and school_id = p_school_id and status = 'active'
  )
$$;
create function public.has_school_staff_role(p_school_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and school_id = p_school_id and status = 'active'
      and role in ('owner', 'director', 'administrator', 'principal', 'teacher')
  )
$$;
create function public.has_school_management_role(p_school_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and school_id = p_school_id and status = 'active'
      and role in ('owner', 'director', 'administrator', 'principal')
  )
$$;
create function public.has_school_admin_role(p_school_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and school_id = p_school_id and status = 'active'
      and role in ('owner', 'director', 'administrator')
  )
$$;
create function public.current_guardian_id(p_school_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select guardian_id from public.memberships
  where user_id = auth.uid() and school_id = p_school_id
    and status = 'active' and role = 'guardian'
  limit 1
$$;
create function public.current_school_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select school_id from public.profiles where id = auth.uid() $$;
create function public.school_login_branding(p_shortcode text)
returns table (name text, primary_color text, logo_path text)
language sql stable security definer set search_path = ''
as $$ select null::text, null::text, null::text where false $$;
create function public.teaches_class_subject(
  p_school_id uuid, p_class_id uuid, p_subject_id uuid
)
returns boolean language sql stable security definer set search_path = ''
as $$ select false $$;
create function public.assert_attendance_within_year()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin return new; end $$;
create function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_school_billing_role(uuid) to authenticated;

alter table public.platform_admins enable row level security;
create policy platform_admins_admin_all on public.platform_admins
  for all to authenticated using (public.is_platform_admin())
  with check (public.is_platform_admin());
alter table public.subscription_plans enable row level security;
create policy subscription_plans_public_select on public.subscription_plans
  for select to anon using (true);
create policy subscription_plans_platform_admin_all on public.subscription_plans
  for all to authenticated using (public.is_platform_admin())
  with check (public.is_platform_admin());
alter table public.school_subscriptions enable row level security;
create policy school_subscriptions_platform_admin_all on public.school_subscriptions
  for all to authenticated using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy school_subscriptions_billing_select on public.school_subscriptions
  for select to authenticated using (public.has_school_billing_role(school_id));
alter table public.school_applications enable row level security;
create policy school_applications_anon_insert on public.school_applications
  for insert to anon with check (status = 'pending'::public.application_status);
create policy school_applications_platform_admin_all on public.school_applications
  for all to authenticated using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant all privileges on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all privileges on tables to anon, authenticated, service_role;

insert into public.schools (id, shortcode, name) values
  ('${ids.ownerSchool}', 'owner-school', 'Owner School'),
  ('${ids.directorSchool}', 'director-school', 'Director School'),
  ('${ids.adminSchool}', 'admin-school', 'Administrator School'),
  ('${ids.revokedSchool}', 'revoked-school', 'Revoked Owner School');
insert into public.platform_admins (id, user_id, revoked_at) values
  ('${ids.platformGrant}', '${ids.platformAdmin}', null),
  ('${ids.secondGrant}', '${ids.secondOperator}', null);
insert into public.profiles (id, full_name, email) values
  ('${ids.platformAdmin}', 'Platform Admin', 'platform-admin@example.test'),
  ('${ids.secondOperator}', 'Second Operator', 'second-operator@example.test');
insert into public.memberships (user_id, school_id, role, status) values
  ('${ids.owner}', '${ids.ownerSchool}', 'owner', 'active'),
  ('${ids.director}', '${ids.directorSchool}', 'director', 'active'),
  ('${ids.administrator}', '${ids.adminSchool}', 'administrator', 'active'),
  ('${ids.revokedOwner}', '${ids.revokedSchool}', 'owner', 'revoked');
insert into public.subscription_plans (id, code, name, price_monthly)
values ('${ids.plan}', 'fixture', 'Fixture plan', 1);
insert into public.school_subscriptions (id, school_id, plan_id, status) values
  ('${ids.ownerSubscription}', '${ids.ownerSchool}', '${ids.plan}', 'active'),
  ('${ids.directorSubscription}', '${ids.directorSchool}', '${ids.plan}', 'active'),
  ('${ids.adminSubscription}', '${ids.adminSchool}', '${ids.plan}', 'active'),
  ('${ids.revokedSubscription}', '${ids.revokedSchool}', '${ids.plan}', 'active');
`

async function runAs(db, role, userId, callback) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${userId}', false); select set_config('request.jwt.claim.role', '${role}', false);`)
  try {
    return await callback()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`)
  }
}

function splitSqlStatements(sql) {
  const statements = []
  let start = 0
  let index = 0
  let state = 'normal'
  let dollarTag = ''
  let blockDepth = 0

  while (index < sql.length) {
    const current = sql[index]
    const next = sql[index + 1]

    if (state === 'single-quoted') {
      if (current === "'" && next === "'") {
        index += 2
        continue
      }
      if (current === "'") state = 'normal'
      index += 1
      continue
    }
    if (state === 'double-quoted') {
      if (current === '"' && next === '"') {
        index += 2
        continue
      }
      if (current === '"') state = 'normal'
      index += 1
      continue
    }
    if (state === 'line-comment') {
      if (current === '\n') state = 'normal'
      index += 1
      continue
    }
    if (state === 'block-comment') {
      if (current === '/' && next === '*') {
        blockDepth += 1
        index += 2
        continue
      }
      if (current === '*' && next === '/') {
        blockDepth -= 1
        index += 2
        if (blockDepth === 0) state = 'normal'
        continue
      }
      index += 1
      continue
    }
    if (state === 'dollar-quoted') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length
        state = 'normal'
        continue
      }
      index += 1
      continue
    }

    if (current === '-' && next === '-') {
      state = 'line-comment'
      index += 2
      continue
    }
    if (current === '/' && next === '*') {
      state = 'block-comment'
      blockDepth = 1
      index += 2
      continue
    }
    if (current === "'") {
      state = 'single-quoted'
      index += 1
      continue
    }
    if (current === '"') {
      state = 'double-quoted'
      index += 1
      continue
    }
    if (current === '$') {
      const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (tag) {
        dollarTag = tag
        state = 'dollar-quoted'
        index += tag.length
        continue
      }
    }
    if (current === ';') {
      const statement = sql.slice(start, index).trim()
      if (statement) statements.push(statement)
      start = index + 1
    }
    index += 1
  }

  const remainder = sql.slice(start).trim()
  if (remainder) statements.push(remainder)
  if (state !== 'normal' && state !== 'line-comment') {
    throw new Error(`Unterminated SQL lexical state: ${state}`)
  }
  return statements
}

test('Operator Workspace migrations apply and enforce their local contracts in disposable PostgreSQL', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(bootstrap)
    for (const migration of migrations) {
      const sql = await readFile(path.join(root, 'supabase', 'migrations', migration), 'utf8')
      const statements = splitSqlStatements(sql)
      await db.exec('begin')
      try {
        for (const statement of statements) await db.query(statement)
        await db.exec('commit')
      } catch (cause) {
        await db.exec('rollback')
        throw new Error(`Failed to apply ${migration}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
      }
    }

    await t.test('seeds every platform feature flag disabled until an administrator enables it', async () => {
      const flags = await db.query(`
        select flag_key, enabled
        from public.platform_feature_flags
        order by flag_key
      `)
      assert.deepEqual(flags.rows, [
        { flag_key: 'billing_ledger', enabled: false },
        { flag_key: 'incident_command', enabled: false },
        { flag_key: 'operations_queue', enabled: false },
        { flag_key: 'school_application_review', enabled: false },
      ])

      const enabledChecks = await db.query(`
        select
          public.is_platform_feature_enabled('operations_queue') as operations_queue,
          public.is_platform_feature_enabled('incident_command') as incident_command,
          public.is_platform_feature_enabled('school_application_review') as school_application_review,
          public.is_platform_feature_enabled('billing_ledger') as billing_ledger
      `)
      assert.deepEqual(enabledChecks.rows[0], {
        operations_queue: false,
        incident_command: false,
        school_application_review: false,
        billing_ledger: false,
      })

      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        await db.query('update public.platform_feature_flags set enabled = true')
      })
    })

    await t.test('creates the expected relations, policies, triggers, and migration order', async () => {
      const relationRows = await db.query(`
        select to_regclass(name)::text as relation
        from unnest(array[
          'public.platform_cases',
          'public.platform_case_events',
          'public.platform_incidents',
          'public.platform_incident_responders',
          'public.platform_incident_updates',
          'public.school_application_notes',
          'public.school_application_document_events',
          'public.school_application_communications',
          'public.school_application_email_provider_events',
          'public.school_application_events',
          'public.platform_control_events',
          'public.platform_maintenance_settings',
          'public.platform_feature_flags',
          'public.platform_health_checks',
          'public.platform_backup_checks',
          'public.platform_invoices',
          'public.platform_payments',
          'public.platform_billing_events'
        ]) as name
      `)
      assert.equal(relationRows.rows.length, 18)
      assert.ok(relationRows.rows.every((row) => row.relation !== null))

      const policyRows = await db.query(`
        select count(*)::int as count
        from pg_policies
        where schemaname = 'public'
          and tablename in (
            'platform_cases', 'platform_case_events', 'platform_incidents',
            'platform_incident_responders', 'platform_incident_updates',
            'school_application_notes', 'school_application_document_events',
            'school_application_communications', 'school_application_events',
            'platform_control_events', 'platform_maintenance_settings',
            'platform_feature_flags', 'platform_health_checks',
            'platform_backup_checks', 'platform_invoices',
            'platform_payments', 'platform_billing_events'
          )
      `)
      assert.ok(policyRows.rows[0].count >= 13)

      const triggerRows = await db.query(`
        select count(*)::int as count
        from pg_trigger
        where not tgisinternal
          and tgrelid in (
            'public.platform_cases'::regclass,
            'public.platform_case_events'::regclass,
            'public.platform_incidents'::regclass,
            'public.platform_incident_responders'::regclass,
            'public.platform_incident_updates'::regclass,
            'public.school_applications'::regclass,
            'public.platform_maintenance_settings'::regclass,
            'public.platform_feature_flags'::regclass,
            'public.platform_health_checks'::regclass,
            'public.platform_backup_checks'::regclass,
            'public.platform_invoices'::regclass,
            'public.platform_payments'::regclass,
            'public.platform_billing_events'::regclass
          )
      `)
      assert.ok(triggerRows.rows[0].count >= 18)

      const retainedServiceAccess = await db.query(`
        select has_table_privilege('service_role', 'public.subscription_plans', 'select') as plans,
               has_table_privilege('service_role', 'public.school_subscriptions', 'select') as subscriptions,
               has_table_privilege('service_role', 'public.platform_admins', 'update') as admins,
               has_table_privilege('service_role', 'public.school_applications', 'insert') as applications
      `)
      assert.deepEqual(retainedServiceAccess.rows[0], {
        plans: true,
        subscriptions: true,
        admins: true,
        applications: true,
      })
    })

    await t.test('limits direct function execution to the intended API roles', async () => {
      const privileges = await db.query(`
        select
          has_function_privilege('anon', 'public.is_platform_admin()', 'execute') as anon_platform_admin,
          has_function_privilege('authenticated', 'public.is_platform_admin()', 'execute') as authenticated_platform_admin,
          has_function_privilege('service_role', 'public.is_platform_admin()', 'execute') as service_platform_admin,
          has_function_privilege('anon', 'public.has_school_billing_role(uuid)', 'execute') as anon_billing_role,
          has_function_privilege('authenticated', 'public.has_school_billing_role(uuid)', 'execute') as authenticated_billing_role,
          has_function_privilege('anon', 'public.teaches_class_subject(uuid, uuid, uuid)', 'execute') as anon_teaches_class_subject,
          has_function_privilege('authenticated', 'public.teaches_class_subject(uuid, uuid, uuid)', 'execute') as authenticated_teaches_class_subject,
          has_function_privilege('service_role', 'public.teaches_class_subject(uuid, uuid, uuid)', 'execute') as service_teaches_class_subject,
          has_function_privilege('anon', 'public.school_login_branding(text)', 'execute') as anon_login_branding,
          has_function_privilege('anon', 'public.assert_attendance_within_year()', 'execute') as anon_legacy_trigger,
          has_function_privilege('authenticated', 'public.assert_attendance_within_year()', 'execute') as authenticated_legacy_trigger,
          has_function_privilege('service_role', 'public.assert_attendance_within_year()', 'execute') as service_legacy_trigger,
          has_function_privilege('anon', 'public.record_platform_operations_audit()', 'execute') as anon_operations_trigger,
          has_function_privilege('authenticated', 'public.record_platform_operations_audit()', 'execute') as authenticated_operations_trigger,
          has_function_privilege('service_role', 'public.record_platform_operations_audit()', 'execute') as service_operations_trigger
      `)
      assert.deepEqual(privileges.rows[0], {
        anon_platform_admin: false,
        authenticated_platform_admin: true,
        service_platform_admin: true,
        anon_billing_role: false,
        authenticated_billing_role: true,
        anon_teaches_class_subject: false,
        authenticated_teaches_class_subject: true,
        service_teaches_class_subject: true,
        anon_login_branding: true,
        anon_legacy_trigger: false,
        authenticated_legacy_trigger: false,
        service_legacy_trigger: false,
        anon_operations_trigger: false,
        authenticated_operations_trigger: false,
        service_operations_trigger: false,
      })
    })

    await t.test('restricts billing reads to active owners/directors or platform admins and keeps plans private', async () => {
      for (const [userId, expectedCount] of [
        [ids.owner, 1],
        [ids.director, 1],
        [ids.administrator, 0],
        [ids.revokedOwner, 0],
        [ids.platformAdmin, 4],
      ]) {
        await runAs(db, 'authenticated', userId, async () => {
          const subscriptions = await db.query('select id from public.school_subscriptions')
          assert.equal(subscriptions.rows.length, expectedCount, `subscription rows for ${userId}`)
          const plans = await db.query('select id from public.subscription_plans')
          assert.equal(plans.rows.length, userId === ids.platformAdmin ? 4 : 0, `plan visibility for ${userId}`)
        })
      }

      const grants = await db.query(`
        select has_table_privilege('anon', 'public.subscription_plans', 'select') as anon_plan_select,
               has_table_privilege('anon', 'public.school_subscriptions', 'select') as anon_subscription_select,
               has_table_privilege('authenticated', 'public.subscription_plans', 'select') as auth_plan_select,
               has_table_privilege('authenticated', 'public.school_subscriptions', 'truncate') as auth_subscription_truncate
      `)
      assert.deepEqual(grants.rows[0], {
        anon_plan_select: false,
        anon_subscription_select: false,
        auth_plan_select: true,
        auth_subscription_truncate: false,
      })
    })

    await t.test('allows only default-state anonymous school applications and restricts reviewer records', async () => {
      const columns = `school_name, administrator_name, email, phone, school_size_band,
        country, applicant_position, school_address, campus_count, student_count_band,
        class_count_band, staff_count_band, curriculum, current_system, reasons`
      const values = `'Test School', 'Test Applicant', 'applicant@example.test', '+100000000',
        'small', 'XX', 'owner', 'Test address', 1, 'under_100', 'one', 'under_10',
        'local', 'none', 'Application submitted in isolated database test'`

      await runAs(db, 'anon', '', async () => {
        await db.query(`insert into public.school_applications (${columns}) values (${values})`)

        await assert.rejects(
          db.query(`insert into public.school_applications (${columns}, status) values (${values}, 'approved')`),
          /row-level security|permission denied/i,
        )
        await assert.rejects(
          db.query(`insert into public.school_applications (${columns}, assigned_reviewer) values (${values}, '${ids.platformAdmin}')`),
          /permission denied/i,
        )
        await assert.rejects(db.query('select id from public.school_applications'), /permission denied/i)
      })

      const inserted = await db.query(`
        select id, status::text as status
        from public.school_applications
        where email = 'applicant@example.test'
      `)
      assert.equal(inserted.rows[0].status, 'pending')
      const recorded = await db.query(`
        select event_type, to_status
        from public.school_application_events
        where application_id = $1
      `, [inserted.rows[0].id])
      assert.deepEqual(recorded.rows, [{ event_type: 'status_changed', to_status: 'pending' }])

      const grants = await db.query(`
        select has_table_privilege('anon', 'public.school_applications', 'truncate') as anon_truncate,
               has_table_privilege('authenticated', 'public.school_application_notes', 'insert') as reviewer_note_insert,
               has_table_privilege('authenticated', 'public.school_application_notes', 'select') as reviewer_note_select,
               has_function_privilege('authenticated', 'public.record_school_application_email_delivery(uuid,text,text,text,text)', 'execute') as auth_delivery_execute,
               has_function_privilege('service_role', 'public.record_school_application_email_delivery(uuid,text,text,text,text)', 'execute') as service_delivery_execute
      `)
      assert.deepEqual(grants.rows[0], {
        anon_truncate: false,
        reviewer_note_insert: false,
        reviewer_note_select: true,
        auth_delivery_execute: false,
        service_delivery_execute: true,
      })
    })

    await t.test('records operator case/incident history, validates resolution, and blocks unauthorized writes', async () => {
      await runAs(db, 'authenticated', ids.administrator, async () => {
        const visible = await db.query('select id from public.platform_cases')
        assert.equal(visible.rows.length, 0)
        await assert.rejects(
          db.query(`
            insert into public.platform_cases (title, case_type, description)
            values ('Unauthorized case', 'support', 'Must be blocked')
          `),
          /row-level security/i,
        )
      })

      const createdRecords = await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        const created = await db.query(`
          insert into public.platform_cases (
            title, case_type, description, assigned_operator_id
          ) values ('Fixture case', 'support', 'Private case description', $1)
          returning id, created_by
        `, [ids.secondGrant])
        assert.equal(created.rows[0].created_by, ids.platformAdmin)

        await db.query(`
          insert into public.platform_case_events (case_id, event_type, body)
          values ($1, 'note', 'Private operator note')
        `, [created.rows[0].id])
        await db.query(`
          update public.platform_cases
          set status = 'resolved', resolution = 'Verified recovery'
          where id = $1
        `, [created.rows[0].id])
        await assert.rejects(
          db.query(`update public.platform_cases set status = 'closed', resolution = null where id = $1`, [created.rows[0].id]),
          /resolution summary is required/i,
        )

        const history = await db.query(`
          select event_type, body from public.platform_case_events where case_id = $1
        `, [created.rows[0].id])
        assert.ok(history.rows.some((row) => row.event_type === 'note' && row.body === 'Private operator note'))
        assert.ok(history.rows.some((row) => row.event_type === 'resolution'))
        const incident = await db.query(`
          insert into public.platform_incidents (title, description, severity, commander_id, linked_case_id)
          values ('Fixture incident', 'Manually recorded test incident', 'sev2', $1, $2)
          returning id, created_by
        `, [ids.platformGrant, created.rows[0].id])
        assert.equal(incident.rows[0].created_by, ids.platformAdmin)

        await db.query('select public.set_platform_incident_responders($1, $2::uuid[])', [
          incident.rows[0].id,
          [ids.secondGrant],
        ])
        await db.query(`
          update public.platform_incidents
          set status = 'resolved'
          where id = $1
        `, [incident.rows[0].id])

        const incidentState = await db.query(`
          select resolved_at from public.platform_incidents where id = $1
        `, [incident.rows[0].id])
        assert.ok(incidentState.rows[0].resolved_at)
        const incidentHistory = await db.query(`
          select update_type, body
          from public.platform_incident_updates
          where incident_id = $1
        `, [incident.rows[0].id])
        assert.ok(incidentHistory.rows.some((row) => row.body === 'Incident command opened'))
        assert.ok(incidentHistory.rows.some((row) => row.body.includes('resolved')))
        const responders = await db.query(`
          select operator_id from public.platform_incident_responders where incident_id = $1
        `, [incident.rows[0].id])
        assert.deepEqual(responders.rows, [{ operator_id: ids.secondGrant }])
        return { caseId: created.rows[0].id, incidentId: incident.rows[0].id }
      })

      await runAs(db, 'authenticated', ids.administrator, async () => {
        await assert.rejects(
          db.query('select public.set_platform_incident_responders($1, $2::uuid[])', [
            createdRecords.incidentId,
            [],
          ]),
          /platform operator access required/i,
        )
      })
    })

    await t.test('keeps contact-message content out of case records', async () => {
      await db.query(`
        insert into public.contact_messages (id, name, email, topic, message)
        values ('60000000-0000-4000-8000-000000000001',
                'Private requester', 'requester@example.test',
                'Secret topic', 'Secret contact message body')
      `)
      const linked = await db.query(`
        select title, description, source_contact_message_id
        from public.platform_cases
        where source_contact_message_id = '60000000-0000-4000-8000-000000000001'
      `)
      assert.deepEqual(linked.rows, [{
        title: 'Contact enquiry',
        description: null,
        source_contact_message_id: '60000000-0000-4000-8000-000000000001',
      }])
      const history = await db.query(`
        select body from public.platform_case_events
        where case_id = (select id from public.platform_cases
          where source_contact_message_id = '60000000-0000-4000-8000-000000000001')
      `)
      assert.ok(history.rows.every((row) => !row.body.includes('Secret')))
    })

    await t.test('authorizes application workflow and delivery RPCs by role', async () => {
      const applicationPolicy = await db.query(`
        select
          exists (
            select 1 from pg_policies
            where schemaname = 'public'
              and tablename = 'school_applications'
              and policyname = 'school_applications_platform_admin_all'
          ) as broad_policy_exists,
          policyname,
          cmd,
          qual
        from pg_policies
        where schemaname = 'public'
          and tablename = 'school_applications'
          and policyname = 'school_applications_platform_admin_select'
      `)
      assert.equal(applicationPolicy.rows.length, 1)
      assert.equal(applicationPolicy.rows[0].broad_policy_exists, false)
      assert.equal(applicationPolicy.rows[0].cmd, 'SELECT')
      assert.match(applicationPolicy.rows[0].qual, /is_platform_admin/)
      assert.match(applicationPolicy.rows[0].qual, /school_application_review/)

      const application = await db.query(`
        insert into public.school_applications (
          school_name, administrator_name, email, phone, status
        ) values (
          'Workflow School', 'Workflow Applicant', 'workflow@example.test',
          '+100000001', 'awaiting_information'
        )
        returning id
      `)
      await runAs(db, 'authenticated', ids.administrator, async () => {
        await assert.rejects(
          db.query(`select public.manage_school_application($1, 'add_note', '{"body":"unauthorized"}'::jsonb)`, [application.rows[0].id]),
          /platform-admin authority/i,
        )
      })

      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        await assert.rejects(
          db.query(
            "update public.school_applications set status = 'rejected' where id = $1",
            [application.rows[0].id],
          ),
          /permission denied|row-level security/i,
        )
        await db.query(`
          select public.manage_school_application($1, 'add_note', '{"body":"Reviewer-only note"}'::jsonb)
        `, [application.rows[0].id])
        const notes = await db.query(`
          select body from public.school_application_notes where application_id = $1
        `, [application.rows[0].id])
        assert.deepEqual(notes.rows, [{ body: 'Reviewer-only note' }])
      })
      await runAs(db, 'authenticated', ids.administrator, async () => {
        const notes = await db.query(`
          select body from public.school_application_notes where application_id = $1
        `, [application.rows[0].id])
        assert.deepEqual(notes.rows, [])
      })

      await db.query(
        'insert into auth.users (id, email) values ($1, $2)',
        [ids.applicant, 'workflow@example.test'],
      )
      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        const approved = await db.query(
          'select public.approve_school_application($1, $2, $3) as result',
          [application.rows[0].id, ids.applicant, 'workflow-school'],
        )
        assert.equal(approved.rows[0].result.user_id, ids.applicant)
        assert.ok(approved.rows[0].result.school_id)
        const status = await db.query(
          'select status::text as status from public.school_applications where id = $1',
          [application.rows[0].id],
        )
        assert.equal(status.rows[0].status, 'approved')
      })

      const communication = await db.query(`
        insert into public.school_application_communications (
          application_id, subject, body
        ) values ($1, 'Activation', 'Provider test only')
        returning id
      `, [application.rows[0].id])
      await runAs(db, 'service_role', ids.platformAdmin, async () => {
        await db.query(`
          select public.record_school_application_email_delivery(
            $1, 'accepted', 'provider-message-test', null, null
          )
        `, [communication.rows[0].id])
        await db.query(`
          select public.record_school_application_email_delivery(
            $1, 'delivered', 'provider-message-test', null, 'provider-event-test'
          )
        `, [communication.rows[0].id])
        const retry = await db.query(`
          select public.record_school_application_email_delivery(
            $1, 'delivered', 'provider-message-test', null, 'provider-event-test'
          ) as result
        `, [communication.rows[0].id])
        assert.equal(retry.rows[0].result.duplicate, true)
        await assert.rejects(
          db.query(`
            select public.record_school_application_email_delivery(
              $1, 'failed', 'provider-message-test', 'provider_rejected', 'provider-event-finalized'
            )
          `, [communication.rows[0].id]),
          /finalized communication delivery cannot change state/i,
        )
      })
      const delivery = await db.query(`
        select delivery_state, provider_message_id, delivered_at
        from public.school_application_communications where id = $1
      `, [communication.rows[0].id])
      assert.equal(delivery.rows[0].delivery_state, 'delivered')
      assert.equal(delivery.rows[0].provider_message_id, 'provider-message-test')
      assert.ok(delivery.rows[0].delivered_at)
    })

    await t.test('maintenance mode is audited and blocks school roles while preserving operator and public submission access', async () => {
      await runAs(db, 'authenticated', ids.owner, async () => {
        const membership = await db.query(
          'select public.is_school_member($1) as member, public.has_school_billing_role($1) as billing',
          [ids.ownerSchool],
        )
        assert.deepEqual(membership.rows[0], { member: true, billing: true })
      })

      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        const updated = await db.query(`
          update public.platform_maintenance_settings
             set enabled = true, message = 'Scheduled maintenance'
           where singleton
           returning enabled
        `)
        assert.deepEqual(updated.rows, [{ enabled: true }])
        const events = await db.query(`
          select event_type from public.platform_control_events
          where entity_type = 'maintenance'
        `)
        assert.ok(events.rows.some((row) => row.event_type === 'maintenance_enabled'))
      })

      await runAs(db, 'authenticated', ids.owner, async () => {
        const predicates = await db.query(
          'select public.is_school_member($1) as member, public.has_school_billing_role($1) as billing',
          [ids.ownerSchool],
        )
        assert.deepEqual(predicates.rows[0], { member: false, billing: false })
        const subscriptions = await db.query('select id from public.school_subscriptions')
        assert.deepEqual(subscriptions.rows, [])
      })

      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        const subscriptions = await db.query('select id from public.school_subscriptions')
        assert.equal(subscriptions.rows.length, 4)
        await db.query('update public.platform_maintenance_settings set enabled = false where singleton')
      })

      await runAs(db, 'anon', '', async () => {
        await db.query(`
          insert into public.school_applications (school_name, administrator_name, email)
          values ('Maintenance Signup', 'Applicant', 'maintenance-signup@example.test')
        `)
      })
    })

    await t.test('feature flags are administrator-managed, audited, and enforced at database boundaries', async () => {
      await runAs(db, 'service_role', '', async () => {
        const rpc = await db.query(`
          select public.is_platform_feature_enabled('school_application_review') as enabled,
                 has_function_privilege(
                   'service_role',
                   'public.is_platform_feature_enabled(text)',
                   'execute'
                 ) as can_check,
                 has_table_privilege(
                   'service_role',
                   'public.platform_feature_flags',
                   'select'
                 ) as can_read_table
        `)
        assert.deepEqual(rpc.rows[0], {
          enabled: true,
          can_check: true,
          can_read_table: false,
        })
      })

      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        await db.query(`
          update public.platform_feature_flags
             set enabled = false
           where flag_key = 'operations_queue'
        `)
        const history = await db.query(`
          select event_type from public.platform_control_events
          where entity_type = 'feature_flag' and entity_key = 'operations_queue'
        `)
        assert.ok(history.rows.length > 0)
        const cases = await db.query('select id from public.platform_cases')
        assert.deepEqual(cases.rows, [])
        await assert.rejects(
          db.query(`
            insert into public.platform_cases (title, case_type, description)
            values ('Disabled feature', 'support', 'Must be rejected')
          `),
          /row-level security/i,
        )
        await db.query(`
          update public.platform_feature_flags
             set enabled = true
           where flag_key = 'operations_queue'
        `)
      })

      await runAs(db, 'anon', '', async () => {
        await db.query(`
          insert into public.school_applications (school_name, administrator_name, email)
          values ('Flag Test', 'Applicant', 'flag-test@example.test')
        `)
      })
      const application = await db.query(`
        select id from public.school_applications
        where email = 'flag-test@example.test'
      `)
      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        await db.query(`
          update public.platform_feature_flags
             set enabled = false
           where flag_key = 'school_application_review'
        `)
        const visible = await db.query('select id from public.school_applications')
        assert.deepEqual(visible.rows, [])
        await assert.rejects(
          db.query(
            "select public.manage_school_application($1, 'add_note', '{\"body\":\"Should be blocked\"}'::jsonb)",
            [application.rows[0].id],
          ),
          /disabled by a platform feature flag/i,
        )
        await db.query(`
          update public.platform_feature_flags
             set enabled = true
           where flag_key = 'school_application_review'
        `)
      })

      await runAs(db, 'authenticated', ids.administrator, async () => {
        const changed = await db.query(`
          update public.platform_feature_flags
             set enabled = false
           where flag_key = 'operations_queue'
          returning flag_key
        `)
        assert.deepEqual(changed.rows, [])
      })
    })

    await t.test('health checks require service-role recording and detect repeated failures without auto-resolving', async () => {
      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        await assert.rejects(
          db.query(`
            select public.record_platform_health_checks(
              '[{"service_name":"database","status":"healthy"}]'::jsonb
            )
          `),
          /permission denied|trusted server execution/i,
        )
        await assert.rejects(
          db.query(`
            insert into public.platform_incidents (
              title, description, severity, detection_source, monitor_service
            ) values ('Forged monitor incident', 'Must be blocked', 'sev3', 'automated_monitor', 'database')
          `),
          /row-level security/i,
        )
      })

      await runAs(db, 'service_role', '', async () => {
        await db.query(`
          select public.record_platform_health_checks(
            '[{"service_name":"operator_tables","status":"unavailable","failure_code":"schema_probe_failed"}]'::jsonb
          )
        `)
      })
      let incidents = await db.query(`
        select id, status, detection_source
        from public.platform_incidents
        where monitor_service = 'operator_tables'
      `)
      assert.deepEqual(incidents.rows, [])

      await runAs(db, 'service_role', '', async () => {
        await db.query(`
          select public.record_platform_health_checks(
            '[{"service_name":"operator_tables","status":"unavailable","failure_code":"schema_probe_failed"}]'::jsonb
          )
        `)
      })
      incidents = await db.query(`
        select id, status, detection_source
        from public.platform_incidents
        where monitor_service = 'operator_tables'
      `)
      assert.deepEqual(incidents.rows, [{
        id: incidents.rows[0]?.id,
        status: 'investigating',
        detection_source: 'automated_monitor',
      }])

      await runAs(db, 'service_role', '', async () => {
        await db.query(`
          select public.record_platform_health_checks(
            '[{"service_name":"operator_tables","status":"healthy"}]'::jsonb
          )
        `)
      })
      const recovering = await db.query(`
        select status from public.platform_incidents where monitor_service = 'operator_tables'
      `)
      assert.deepEqual(recovering.rows, [{ status: 'monitoring' }])
      const updates = await db.query(`
        select body from public.platform_incident_updates
        where incident_id = $1
      `, [incidents.rows[0].id])
      assert.ok(updates.rows.some((row) => row.body.includes('requires operator')))
      assert.ok(updates.rows.some((row) => row.body.includes('remains open')))
    })

    await t.test('backup status records provider evidence only and remains separate from restore verification', async () => {
      await runAs(db, 'authenticated', ids.platformAdmin, async () => {
        await assert.rejects(
          db.query(`
            select public.record_platform_backup_check(
              'records_found', 1, now(), 'COMPLETED', null
            )
          `),
          /permission denied|trusted server execution/i,
        )
      })
      await runAs(db, 'service_role', '', async () => {
        await db.query(`
          select public.record_platform_backup_check(
            'records_found', 1, '2026-10-19T12:00:00Z', 'COMPLETED', null
          )
        `)
      })
      const checks = await runAs(db, 'authenticated', ids.platformAdmin, async () =>
        db.query('select status, backup_count, latest_backup_status from public.platform_backup_checks'),
      )
      assert.deepEqual(checks.rows, [{
        status: 'records_found',
        backup_count: 1,
        latest_backup_status: 'COMPLETED',
      }])
      await runAs(db, 'service_role', '', async () => {
        await assert.rejects(
          db.query(`
            select public.record_platform_backup_check(
              'records_found', 0, null, null, null
            )
          `),
          /backup evidence fields are inconsistent/i,
        )
      })
    })

    await t.test('billing ledger uses school billing roles, immutable audit history, and provider evidence for successful payments', async () => {
      let invoiceId = ''
      let paymentId = ''
      await runAs(db, 'service_role', '', async () => {
        const invoice = await db.query(`
          insert into public.platform_invoices (
            invoice_number, school_id, subscription_id, billing_period_start,
            billing_period_end, amount_minor, currency, status
          ) values (
            'TEST-INV-001', $1, $2, '2026-10-01', '2026-11-01', 12345, 'USD', 'open'
          ) returning id
        `, [ids.ownerSchool, ids.ownerSubscription])
        invoiceId = invoice.rows[0].id

        await assert.rejects(
          db.query(`update public.platform_invoices set status = 'paid' where id = $1`, [invoiceId]),
          /without provider-referenced successful payment records/i,
        )
        await assert.rejects(
          db.query(`
            insert into public.platform_payments (
              invoice_id, provider, amount_minor, currency, status
            ) values ($1, 'unconfigured', 12345, 'USD', 'succeeded')
          `, [invoiceId]),
          /success evidence|check constraint/i,
        )

        const payment = await db.query(`
          insert into public.platform_payments (
            invoice_id, provider, provider_payment_id, provider_event_id,
            amount_minor, currency, status
          ) values (
            $1, 'test-provider-fixture', 'test-payment-id', 'test-event-id',
            12345, 'USD', 'succeeded'
          ) returning id
        `, [invoiceId])
        paymentId = payment.rows[0].id
        await db.query(`
          update public.platform_invoices set status = 'paid' where id = $1
        `, [invoiceId])
      })

      const ownerLedger = await runAs(db, 'authenticated', ids.owner, async () => {
        const invoiceRows = await db.query('select id, status from public.platform_invoices')
        const paymentRows = await db.query('select id, status from public.platform_payments')
        const eventRows = await db.query(`
          select event_type, to_status from public.platform_billing_events
          where invoice_id = $1 or payment_id = $2
        `, [invoiceId, paymentId])
        return { invoiceRows, paymentRows, eventRows }
      })
      assert.deepEqual(ownerLedger.invoiceRows.rows, [{ id: invoiceId, status: 'paid' }])
      assert.deepEqual(ownerLedger.paymentRows.rows, [{ id: paymentId, status: 'succeeded' }])
      assert.ok(ownerLedger.eventRows.rows.some((row) => row.event_type === 'invoice_created' && row.to_status === 'open'))
      assert.ok(ownerLedger.eventRows.rows.some((row) => row.event_type === 'invoice_status_changed' && row.to_status === 'paid'))
      assert.ok(ownerLedger.eventRows.rows.some((row) => row.event_type === 'payment_recorded' && row.to_status === 'succeeded'))

      await runAs(db, 'authenticated', ids.administrator, async () => {
        assert.deepEqual((await db.query('select id from public.platform_invoices')).rows, [])
        await assert.rejects(
          db.query(`insert into public.platform_invoices (invoice_number, school_id, amount_minor, currency) values ('FORGED', $1, 100, 'USD')`, [ids.adminSchool]),
          /permission denied/i,
        )
      })

      await runAs(db, 'service_role', '', async () => {
        await assert.rejects(
          db.query('delete from public.platform_invoices where id = $1', [invoiceId]),
          /immutable|permission denied/i,
        )
      })
    })

    await t.test('subscription checkout is idempotent, price-authoritative, and activates only verified payments', async () => {
      const paymentKey = '60000000-0000-4000-8000-000000000001'
      let checkout
      await runAs(db, 'service_role', '', async () => {
        await db.query(`
          update public.school_subscriptions
             set status = 'cancelled', cancelled_at = now()
           where school_id = $1
        `, [ids.ownerSchool])

        const created = await db.query(`
          select public.create_subscription_checkout($1, 'starter', 'monthly', $2, $3) as checkout
        `, [ids.ownerSchool, paymentKey, ids.owner])
        checkout = created.rows[0].checkout
        assert.equal(checkout.should_process, true)
        assert.equal(checkout.amount_minor, 6000)
        assert.equal(checkout.currency, 'USD')

        const replay = await db.query(`
          select public.create_subscription_checkout($1, 'starter', 'monthly', $2, $3) as checkout
        `, [ids.ownerSchool, paymentKey, ids.owner])
        assert.equal(replay.rows[0].checkout.replayed, true)
        assert.equal(replay.rows[0].checkout.payment_id, checkout.payment_id)

        await assert.rejects(
          db.query(`
            select public.create_subscription_checkout(
              $1, 'growth', 'monthly', '60000000-0000-4000-8000-000000000002', $2
            )
          `, [ids.ownerSchool, ids.owner]),
          /pending or requires verification/i,
        )

        const finalized = await db.query(`
          select public.finalize_subscription_payment(
            $1, 'succeeded', 'WAAFIPAY-SCHOOL-001', 'WAAFIPAY-RESPONSE-001', 6000, 'USD'
          ) as result
        `, [checkout.payment_id])
        assert.equal(finalized.rows[0].result.status, 'succeeded')

        const duplicateFinalization = await db.query(`
          select public.finalize_subscription_payment(
            $1, 'succeeded', 'WAAFIPAY-SCHOOL-001', 'WAAFIPAY-RESPONSE-001', 6000, 'USD'
          ) as result
        `, [checkout.payment_id])
        assert.equal(duplicateFinalization.rows[0].result.replayed, true)
        assert.equal(duplicateFinalization.rows[0].result.status, 'succeeded')

        const ledger = await db.query(`
          select p.status as payment_status, i.status as invoice_status,
                 i.subscription_id, s.status as subscription_status
            from public.platform_payments p
            join public.platform_invoices i on i.id = p.invoice_id
            join public.school_subscriptions s on s.id = i.subscription_id
           where p.id = $1
        `, [checkout.payment_id])
        assert.deepEqual(ledger.rows, [{
          payment_status: 'succeeded',
          invoice_status: 'paid',
          subscription_id: ledger.rows[0].subscription_id,
          subscription_status: 'active',
        }])
        const audit = await db.query(`
          select event_type, to_status
            from public.platform_billing_events
           where invoice_id = $1 or payment_id = $2
        `, [checkout.invoice_id, checkout.payment_id])
        assert.ok(audit.rows.some((row) => row.event_type === 'invoice_created' && row.to_status === 'open'))
        assert.ok(audit.rows.some((row) => row.event_type === 'payment_status_changed' && row.to_status === 'succeeded'))
        assert.ok(audit.rows.some((row) => row.event_type === 'invoice_status_changed' && row.to_status === 'paid'))

        await db.query(`
          update public.school_subscriptions
             set status = 'cancelled', cancelled_at = now()
           where school_id = $1
        `, [ids.directorSchool])
        const unverified = await db.query(`
          select public.create_subscription_checkout(
            $1, 'growth', 'monthly', '60000000-0000-4000-8000-000000000003', $2
          ) as checkout
        `, [ids.directorSchool, ids.director])
        const unknownResult = await db.query(`
          select public.finalize_subscription_payment(
            $1, 'succeeded', 'WAAFIPAY-SCHOOL-002', 'WAAFIPAY-RESPONSE-002', 1, 'USD'
          ) as result
        `, [unverified.rows[0].checkout.payment_id])
        assert.equal(unknownResult.rows[0].result.status, 'unknown')
        assert.equal(unknownResult.rows[0].result.subscription_id, null)
        const unverifiedLedger = await db.query(`
          select p.status as payment_status, i.status as invoice_status
            from public.platform_payments p
            join public.platform_invoices i on i.id = p.invoice_id
           where p.id = $1
        `, [unverified.rows[0].checkout.payment_id])
        assert.deepEqual(unverifiedLedger.rows, [{ payment_status: 'unknown', invoice_status: 'open' }])

        await db.query(`
          update public.school_subscriptions
             set status = 'cancelled', cancelled_at = now()
           where school_id = $1
        `, [ids.adminSchool])
        const starter = await db.query(`select id from public.subscription_plans where code = 'starter'`)
        const staleInvoice = await db.query(`
          insert into public.platform_invoices (
            invoice_number, school_id, amount_minor, currency, status,
            due_at, created_by, subscription_plan_id, billing_interval
          ) values ('STALE-SUB-PRICE', $1, 5000, 'USD', 'open', now() + interval '1 day', $2, $3, 'monthly')
          returning id
        `, [ids.adminSchool, ids.administrator, starter.rows[0].id])
        await db.query(`update public.subscription_plans set price_monthly = 70 where id = $1`, [starter.rows[0].id])
        const repriced = await db.query(`
          select public.create_subscription_checkout(
            $1, 'starter', 'monthly', '60000000-0000-4000-8000-000000000004', $2
          ) as checkout
        `, [ids.adminSchool, ids.administrator])
        const oldInvoice = await db.query(`select status from public.platform_invoices where id = $1`, [staleInvoice.rows[0].id])
        assert.equal(oldInvoice.rows[0].status, 'void')
        assert.equal(repriced.rows[0].checkout.amount_minor, 7000)
      })

      const privileges = await db.query(`
        select has_function_privilege('anon', 'public.create_subscription_checkout(uuid, text, text, uuid, uuid)', 'execute') as anon_create,
               has_function_privilege('authenticated', 'public.finalize_subscription_payment(uuid, text, text, text, bigint, text)', 'execute') as authenticated_finalize,
               has_function_privilege('service_role', 'public.create_subscription_checkout(uuid, text, text, uuid, uuid)', 'execute') as service_create
      `)
      assert.deepEqual(privileges.rows[0], {
        anon_create: false,
        authenticated_finalize: false,
        service_create: true,
      })
    })
  } finally {
    await db.close()
  }
})
