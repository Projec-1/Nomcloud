# Nomcloud Release Checklist

**Last reconciled:** 2026-10-22  
**Branch:** `release-candidate/2026-10-21-platform`  
**Connected Supabase project:** `fxdnkdyqdwxtgtbylxcr`  
**Rule:** A code change, build, or mock test is not evidence of a live or sandbox payment.

Status values: **PASS**, **FAIL**, **BLOCKED**, **NOT VERIFIED**.

## Stage 1 — Establish the baseline

**Stage status: PASS**

| Item | Status | Evidence |
|---|---|---|
| Branch, HEAD, remotes, and recent history | PASS | HEAD `1718f32`; branch tracks `origin/release-candidate/2026-10-21-platform`; current branch is not ahead of its upstream. `origin/main` is at `a899624`; the release branch includes the merge commits shown in the inspected graph. |
| Working-tree preservation | PASS | No staged changes. Existing staged/unstaged and untracked work was inventoried and left untouched. The existing `stash@{0}` was listed and not applied, dropped, or altered. |
| Frontend Supabase target | PASS | `src/lib/supabase.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; no values were displayed. Previous browser network evidence and current endpoint probes identify `fxdnkdyqdwxtgtbylxcr`. |
| Existing implementation reports | PASS | Reviewed `docs/MIGRATIONS.md`, payment plans, system issue list, and Operator Workspace audit documents. No prior authoritative staged release checklist existed under `docs/release/`. |
| Protected history file | PASS | It was not opened, read, displayed, or modified. |

## Stage 2 — Reconcile the database

**Stage status: BLOCKED** — the Stage 2E read-only preflight confirmed the linked migration ledger and dry-run order, but the supported backup inventory returned no physical backups and PITR is disabled. There is no verified target recovery point or restore test, so none of the nine pending migrations is ready for application to this data-bearing project. Stage 2D's four disabled flag seeds and the corrected policy remain locally validated; no migration was applied to the connected project.

### Migration ledger

The repository contains **66 local migration files**. A read-only linked query and `supabase migration list --linked` both succeeded on 2026-10-22: **57 applied versions**, from `20260903000001` through `20260927191153`, match the local history; **9 migrations are pending**. `supabase db push --linked --dry-run` also succeeded after the local correction and listed the same nine files in timestamp order without applying them.

The previously reported temporary-role authentication failure did not reproduce. A serial `supabase db query --linked` initialized the CLI login role and returned `current_user = postgres` on PostgreSQL 17.6; `migration list --linked` succeeded. The available evidence therefore does not establish a persistent credentials, connection, or permission defect, and the original intermittent error's precise cause remains unverified. Concurrent CLI invocations during this investigation caused a separate local `EPERM` rename of the Supabase telemetry file; this was a Windows CLI telemetry-write race, not a database authentication error. Run linked CLI operations serially. No credentials or generated local keys were displayed.

`docs/MIGRATIONS.md` documents the earlier migration history and numbering policy but does not enumerate this nine-file pending set; its prepared-migration status is stale relative to the live ledger and dry-run. This checklist records the current reconciliation without modifying the historical migration reference.

### Stage 2B — access, catalog, and isolated migration verification

- Read-only catalog access succeeded through the linked Supabase CLI. RLS is enabled and not forced on the 15 inspected existing school, identity, application, platform, fee, and audit relations. Their live policies were retrieved, including anonymous insert-only policies for school applications and contact messages; platform-admin policies; owner/director subscription reads; school-admin and guardian fee access; and read-only fee payment-event access.
- The live `20261019000001` preflight checks found **no direct `PUBLIC` table/column grants** on its four target tables and **no inherited memberships** for `anon`, `authenticated`, or `service_role`. Its required `platform_admins.team` and application workflow columns are expected to be created by earlier pending migrations, so run that migration only in the documented order.
- Live constraints, indexes, and triggers were retrieved for the existing school, subscription, application, platform-admin, audit, and fee-ledger relations. The fee ledger has positive-amount and balance checks, school-scoped composite foreign keys, provider-event uniqueness, and the expected payment currency/date/edit guards and balance/update triggers. No conflicting pending-created relation was found.
- Live function definitions and privileges confirmed `apply_payment_event` is service-role-only and `approve_school_application` is authenticated-only. The current `has_school_billing_role`, `has_school_admin_role`, and `is_platform_admin` predicates are executable by `anon`; several trigger-returning functions also have broad execute grants. These are observed grant-hardening discrepancies, not evidence of anonymous row exposure; `20261011000001` and `20261022100000` restrict the relevant grants. The local full-chain post-check verified the intended final role boundary.
- A fresh isolated Supabase local project used a unique project ID, separate ports, no seed data, and a copy of all 66 migration files. The first full-chain attempt exposed a real policy-name mismatch: the connected project and applied migration define `school_applications_platform_admin_all`, while `20261019200000` attempted to drop nonexistent `school_applications_platform_admin_select`. The migration was corrected locally to drop `_all`, and the PGlite bootstrap was corrected to mirror the live policy so this mismatch remains regression-tested. No remote policy was changed.
- After that local-only correction, Supabase started the disposable project and applied all **66/66** migrations. Read-only local verification returned **3** subscription plans, all 9 expected pending relations, the two new application enum labels, no target-table `PUBLIC` grants, no API-role inheritance, `anon` unable to execute `has_school_billing_role`, `service_role` able to execute `apply_payment_event`, and `authenticated` able to execute `approve_school_application`. The disposable database, volume, containers, and temporary files were removed.
- Stage 2C added explicit regression assertions that the broad application policy is gone, the replacement is platform-admin SELECT gated by the review flag, and a platform admin cannot directly update application rows while the authorized workflow RPC remains available.
- Stage 2D adds an assertion that all four seeded flags and their database predicate results are initially disabled. The contract then explicitly enables the flags as a platform admin for downstream enabled-feature tests.
- Stage 2D targeted migration-contract test passed **15/15**. The full `npm run test:operator-workspace` suite passed **72/72**, with no failures or timeouts; `git diff --check` passed.

### Stage 2C — final migration review

- The connected project and applied `20260912000001_platform_and_identity_rls.sql` both define `school_applications_platform_admin_all`. The local correction drops that exact policy and installs `school_applications_platform_admin_select`, restricted to `authenticated` platform admins while `school_application_review` is enabled. Public anonymous insert remains separately constrained; application reads do not grant direct browser write access. Direct table updates are revoked; review mutations use authorized workflow/approval RPCs with platform-admin checks. The fixture mirrors the live `_all` prerequisite, so reverting the migration to drop `_select` makes the disposable contract test fail at migration application.
- `20261023120000_subscription_checkout.sql` is strictly later than `20261022100000_restrict_api_function_execution.sql`; it depends on plans/subscriptions from the applied base and platform invoices/payments from `20261019200000`. No migration-numbering rule in `docs/MIGRATIONS.md` bars a future-dated version. Do not renumber it solely because its date is one day ahead of the 2026-10-22 review date.
- Checkout plan prices are read from `subscription_plans`; the Starter/Growth/Enterprise seeds use `ON CONFLICT (code) DO NOTHING`, preserving existing catalog rows rather than silently repricing them. Fixed-price checkout accepts Starter/Growth only. A school-row lock plus a unique partial idempotency-key index prevents duplicate checkout creation; active/pending/unknown attempts block new attempts. Finalization locks the school/payment/invoice and only activates the subscription for a pending payment whose amount, currency, provider identifiers, and invoice state meet the checks. Both RPCs revoke API-role execution and grant only `service_role`. The Edge Function separately verifies the returned merchant reference before calling finalization. This is local contract evidence only; `provider_event_id` is not itself unique across payment rows and no webhook/reconciliation test was performed.
- The four feature flags are now all seeded `enabled=false`; enabling them permits:
  - `operations_queue` gates platform-admin access to operations cases/events and corresponding UI actions. It does not grant school-member access.
  - `incident_command` gates platform-admin incident access/actions and automated incident/recovery updates generated by health-check recording. The health-check function is not deployed to the connected project, so the automated path is not ready there.
  - `school_application_review` gates platform-admin reads of applications/workflow history and review writes. It exposes applicant records only to authorized platform admins, but the workflow function is not deployed remotely.
  - `billing_ledger` gates invoice/payment reads for platform admins and active owners/directors of the invoice's own school. Enabling it intentionally adds same-school billing-history visibility, not cross-school access. The checkout function is not deployed remotely.
- **Safe-default decision (Stage 2D):** all four flags are now explicitly seeded `enabled=false`; the table schema/default and conflict handling are unchanged. Enable each only after its corresponding UI/backend dependency is deployed and verified. This avoids exposing partial workflows during a migration-first rollout; `school_application_review` protects applicant data and `billing_ledger` gates financial-record visibility. Operations Queue is database-backed directly, while the incident monitor, application workflow, and subscription checkout each have undeployed function dependencies. Remote application and verification are still outstanding, so Stage 2 remains **BLOCKED**.

### Stage 2D — disabled feature-flag seeds and tests

- Changed only the four initial migration seed values to `enabled=false`; the `enabled` column schema/default and `ON CONFLICT (flag_key) DO NOTHING` behavior are unchanged.
- Added a migration-contract assertion covering all four stored seed values and all four `is_platform_feature_enabled(...)` results before enabling flags for later positive-path contract tests.
- Targeted command `node --experimental-strip-types --test tests/operator-workspace-migrations.test.mjs`: **15/15 passed**.
- Full command `npm run test:operator-workspace`: **72/72 passed**, 0 failed, 0 timed out.
- `git diff --check`: **passed** (only existing LF-to-CRLF warnings from unrelated modified files).
- No remote migration, Edge Function deployment, or application deployment was run. Remote migration verification remains BLOCKED.

### Stage 2E — read-only linked-project preflight and recovery readiness

- Using Supabase CLI 2.117.0, `npx supabase migration list --linked` confirmed **57 applied migrations** through `20260927191153` and the same **9 pending migrations** below. `npx supabase db push --linked --dry-run` listed those nine in timestamp order and reported dry-run only. Neither command applied or repaired migration history.
- `npx supabase backups list --project-ref fxdnkdyqdwxtgtbylxcr` succeeded as a read-only inventory. Its response reported `region=eu-central-1`, `walg_enabled=true`, `pitr_enabled=false`, `backups=[]`, and an empty `physical_backup_data` object. No backup timestamp or usable physical backup is available in that inventory. `walg_enabled=true` alone does not establish a user-restorable snapshot or point-in-time recovery.
- **Backup/recovery: BLOCKED.** The available evidence does not establish backup coverage for the affected database objects/data, a target-specific restore procedure, or a tested restore. Existing release guidance requires taking/verifying a backup and proving a restore path, but is not a project-specific recovery runbook. No separate staging project exists per the current project context. A separate non-production target with representative data is strongly recommended before migration application; it does not replace a verified recovery path for the connected project.
- The live catalog showed expected pending-migration prerequisites absent, not unexpected collisions: `platform_admins.team`; new platform operations, control, health, backup, billing, and application workflow-history relations; the new application workflow columns; checkout metadata; and the two new application enum values. The base `school_applications` table does contain earlier approval/review fields such as `reviewed_by`, `reviewed_at`, `rejection_reason`, and `approved_school_id`; only the new workflow fields (including reviewer assignment, priority, due date, and checklist/flag JSON columns) are absent. `school_applications_platform_admin_all` is the live policy the corrected migration replaces. `subscription_plans` exists with zero rows. These findings match the ordered migration assumptions; no conflicting pending-created relation was reported.
- The current security-sensitive differences remain important: selected authorization predicates are executable by `anon` before the pending function-hardening migration, and the application policy currently grants platform-admin `FOR ALL` access before the pending migration narrows it to SELECT while review writes use guarded RPCs. These are intentional behavior/privilege changes to verify after any approved application; no anonymous row exposure was demonstrated by the read-only checks.
- **Disposition: A — BLOCKED.** The CLI inventory, missing restore evidence, and absence of staging mean the connected project's preflight is not complete. The successful dry run and local tests do not authorize migration application. No remote settings, data, grants, policies, migrations, or deployments were changed.

Remote history groups: `20260903000001–20260903000002`; `20260904000001–20260904000012`; `20260905000001–20260905000002`; `20260906000001–20260906000002`; `20260908000001–20260908000003`; `20260909000001`; `20260911000001–20260911000007`; `20260912000001–20260912000006`; `20260913000001–20260913000002`; `20260914000001`; `20260915000001–20260915000007`; `20260916000001–20260916000007`; `20260922000001`; `20260923000001`; `20260924000001–20260924000002`; `20260927191153`.

| Migration version / file | Status | Purpose, objects, dependencies, and readiness evidence |
|---|---|---|
| `20261011000001_subscription_billing_access.sql` | **BLOCKED — TARGET RECOVERY** | Replaces `has_school_billing_role(uuid)`, enables RLS on `subscription_plans`, removes its public-select policy, revokes `anon`, and grants authenticated reads. Both subscription relations exist; live RLS/policy and function grants were read, including the current `anon` execute grant. The fresh local full-chain test validates the intended change, but target application is blocked until a usable backup and restore path are verified. |
| `20261011000002_platform_operations.sql` | **BLOCKED — TARGET RECOVERY** | Adds `platform_admins.team`, cases/events, incidents/responders/updates, indexes, RLS/policies, audit/change triggers, contact-message synchronization, and `set_platform_incident_responders`. Live dependencies (`platform_admins`, profiles, schools, contact messages, audit logs, and `is_platform_admin()`) exist; new target relations and `team` are absent as expected. Fresh local full-chain application passed. No explicit historical contact-message backfill or destructive data operation; platform-admin grants and automatic future contact synchronization remain security/behavior-sensitive. Target application is blocked pending verified recovery. |
| `20261014000001_school_application_statuses.sql` | **BLOCKED — TARGET RECOVERY** | Adds enum labels `awaiting_information` and `onboarding` with `IF NOT EXISTS`. The live `application_status` enum exists and currently has only `pending, approved, rejected, withdrawn`. The migration is deliberately isolated before dependent workflow functions; the exact pending migration chain passes the PGlite suite. The enum change is additive but is not trivially reversible once values are used; target application is blocked pending verified recovery. |
| `20261014000002_school_application_workflow.sql` | **BLOCKED — TARGET RECOVERY** | Adds reviewer/workflow columns and constraints on `school_applications`; creates notes, document events, communications, provider events, and status events with indexes/RLS; changes the anonymous-insert policy; adds the admin-only workflow and service-only delivery RPCs/triggers. New workflow columns/relations are absent; earlier approval/review fields are present. New columns with defaults initialize existing rows; there is no explicit historical event backfill. `record_school_application_email_delivery(uuid,text,text,text)` is conditionally dropped but absent remotely, so that statement is a no-op. Local full-chain and migration-contract tests passed; target application is blocked pending verified recovery. |
| `20261014000003_approve_school_application_awaiting_information.sql` | **BLOCKED — TARGET RECOVERY** | Replaces `approve_school_application(uuid,uuid,text)` to accept `awaiting_information`; depends on the prior enum addition and existing approval transaction. The base RPC exists and the enum value does not yet. The fresh local full-chain and authorization/atomicity contract tests passed. This changes an approval workflow; target application is blocked pending verified recovery. |
| `20261019000001_operator_workspace_table_privileges.sql` | **BLOCKED — TARGET RECOVERY** | Revokes table/column privileges on plans, subscriptions, platform admins, and applications; restores only explicit authenticated select, anonymous application insert, and `team` update grants. Live prechecks found no direct `PUBLIC` ACLs or inherited API-role memberships. `team` and workflow columns are created by preceding pending migrations; full local ordered application passed. This is a security-sensitive privilege change and target application is blocked pending verified recovery. |
| `20261019200000_platform_controls_health_backup_billing.sql` | **BLOCKED — TARGET RECOVERY** | Adds control/maintenance/feature-flag tables and seeds one maintenance row plus four flags; rewrites shared school authorization predicates; adds health/backup evidence and service-only recorder RPCs; adds provider-neutral platform billing tables, constraints, indexes, append-only/delete guards, RLS/policies, and billing audit triggers. The policy-name defect is corrected and the fixture mirrors the live `_all` policy. Stage 2D seeds all four feature flags disabled and tests those initial values. Local migration-contract coverage passes; no historical billing backfill. These new objects are not present remotely, and target application is blocked pending verified recovery. |
| `20261022100000_restrict_api_function_execution.sql` | **BLOCKED — TARGET RECOVERY** | Revokes anonymous execution from selected authorization predicates and all trigger-returning functions; grants selected predicates to authenticated/service roles. Live ACL reads confirmed `anon` can currently execute several listed predicates, including `has_school_billing_role`, `has_school_admin_role`, and `is_platform_admin`; the isolated full-chain post-check verified the intended final boundary. This is a security-sensitive grant change; target application is blocked pending verified recovery. |
| `20261023120000_subscription_checkout.sql` | **BLOCKED — TARGET RECOVERY** | Adds invoice plan/interval fields and payment idempotency key/index; seeds Starter/Growth/Enterprise only when absent; creates service-role-only checkout/finalization RPCs. Depends on the billing/feature-flag objects from `20261019200000` and base subscriptions/plans. The live plan table has **0 rows** and the local full-chain test produced 3 plans; dependencies, permissions, replay behavior, and ordering passed local review. Version `20261023120000` follows `20261022100000`; its next-day date is not a numbering defect under the repository's timestamp convention. Provider event IDs are not unique in the ledger and no webhook path is implemented, so broader callback replay assurance remains outside this migration test. No real-money payment was run; target application is blocked pending verified recovery. |

The local policy-name defect is corrected, the four feature flags default to disabled, and local migration-contract/full-chain evidence is recorded above. However, **all nine migrations are BLOCKED for application to the connected project** until an adequate backup and restore path are verified. The earlier feature-flag-default blocker is resolved; the present blocker is recovery readiness. No remote migration has been applied.

### Expected impact and non-production prechecks

- `20261011000001` and `20261022100000` change authorization behavior/grants; verify owner/director access and anonymous denial before deploying dependent callers.
- `20261011000002`, `20261014000002`, and `20261019200000` add operational/application/billing relations, policies, indexes, RPCs, and audit triggers. There is no explicit backfill: historical contact messages will not be copied into cases, old application statuses will not get status-event rows, and no historical platform invoices/payments are inferred.
- `20261014000001` adds enum labels. `20261014000003` changes the set of application statuses accepted by the approval RPC.
- `20261019000001` narrows direct grants. Its impact is intentionally to remove browser-role direct access outside its explicit grants; it may stop existing clients that rely on those grants.
- `20261019200000` creates one disabled maintenance setting and four feature flags explicitly seeded `enabled=false`; the database column default remains unchanged and `ON CONFLICT (flag_key) DO NOTHING` preserves existing flag state. Validate each role boundary and ensure maintenance starts disabled.
- `20261023120000` adds subscription metadata/idempotency and seeds plan rows only when their plan codes are absent. Live catalog count is zero, so the intended seed rows currently have no existing-row conflict; verify inserted prices/currency after the migration.

Before applying to an approved non-production database, run the existing migration dry run and inspect the grant assumptions. The following catalog queries are read-only prechecks/verification queries; execute them only against the approved non-production target after linking it:

```sql
-- Direct PUBLIC relation/column grants on the tables checked by 20261019000001.
select c.relname, acl.privilege_type, 'table' as grant_level
from pg_class c
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
where c.relnamespace = 'public'::regnamespace
  and c.relname = any (array['subscription_plans','school_subscriptions','platform_admins','school_applications'])
  and acl.grantee = 0
union all
select c.relname, acl.privilege_type, 'column' as grant_level
from pg_class c
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) acl
where c.relnamespace = 'public'::regnamespace
  and c.relname = any (array['subscription_plans','school_subscriptions','platform_admins','school_applications'])
  and acl.grantee = 0;

-- Confirm no API role inherits another role before the privilege cleanup.
select api_role.rolname as api_role, inherited.rolname as inherited_role
from pg_roles api_role
join pg_roles inherited
  on inherited.rolname <> api_role.rolname
 and pg_has_role(api_role.oid, inherited.oid, 'USAGE')
where api_role.rolname = any (array['anon','authenticated','service_role']);

-- After migration, inspect target relation RLS and policy coverage.
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname = any (array[
    'platform_invoices','platform_payments','platform_billing_events',
    'platform_health_checks','platform_backup_checks','school_application_notes',
    'school_application_communications'
  ])
order by c.relname;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'platform_invoices','platform_payments','platform_billing_events',
    'platform_health_checks','platform_backup_checks','school_application_notes',
    'school_application_communications'
  ])
order by tablename, policyname;

-- Verify constraints, indexes, and triggers created for the billing/workflow tables.
select conrelid::regclass::text as relation, conname, contype,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  select c.oid from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (array[
      'platform_invoices','platform_payments','platform_billing_events',
      'platform_health_checks','platform_backup_checks','payment_events',
      'fee_payments','school_application_notes','school_application_communications'
    ])
)
order by relation, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = any (array[
    'platform_invoices','platform_payments','platform_billing_events',
    'platform_health_checks','platform_backup_checks','payment_events',
    'fee_payments','school_application_notes','school_application_communications'
  ])
order by tablename, indexname;

select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = any (array[
    'platform_invoices','platform_payments','platform_billing_events',
    'platform_health_checks','platform_backup_checks','payment_events',
    'fee_payments','school_application_notes','school_application_communications'
  ])
order by event_object_table, trigger_name;

-- Confirm RPC existence and the intended API-role execute boundary.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any (array[
    'apply_payment_event','create_subscription_checkout','finalize_subscription_payment',
    'manage_school_application','record_platform_health_checks','record_platform_backup_check'
  ])
order by p.proname, arguments;
```

### Live object snapshot

Read-only catalog queries confirmed:

- Existing columns were freshly listed for the subscription, application, platform-admin, identity, audit, and student-fee relations. Existing subscription tables do **not** contain checkout plan/interval or idempotency fields. `school_applications` contains earlier approval/review fields (`reviewed_by`, `reviewed_at`, `rejection_reason`, and `approved_school_id`), but not the new workflow columns (`assigned_reviewer`, `archived_at`, `priority`, `review_due_at`, or the workflow checklist/flag JSON fields); `platform_admins.team` is absent.
- The `information_schema.columns` query returned no rows for target relations introduced by pending migrations: platform cases/incidents/control/health/backup/billing tables and school-application workflow-history tables. The prior relation inventory also found those absent.
- `subscription_plans` exists but currently has **zero plan rows**.
- RLS is enabled and not forced on the 15 inspected existing tables. The policy inventory confirmed the school/application/platform/fee boundaries described in Stage 2B above. Student-fee constraints, indexes, and triggers were retrieved successfully; no live conflicting pending-created relation exists.
- `apply_payment_event` exists and is executable by `service_role`, not `anon` or `authenticated`. `approve_school_application` exists for `authenticated`. `has_school_billing_role`, `has_school_admin_role`, and `is_platform_admin` currently allow `anon` execution, and multiple trigger-returning functions have broad grants; the pending function-hardening migrations address these boundaries. No anonymous row exposure was demonstrated.
- The fresh linked Supabase security advisor reported **79 WARN findings**: 34 anonymous SECURITY DEFINER execute grants, 43 authenticated SECURITY DEFINER execute grants, plus warnings for leaked-password protection and long OTP expiry. A read-only catalog classification of the 34 anonymous functions found 13 trigger-returning functions, 20 named authorization predicates covered by `20261022100000_restrict_api_function_execution.sql`, and the intentionally public `school_login_branding(text)` function. The pending migration revokes direct API execution from the 20 predicates' anonymous role and trigger-returning functions while preserving authenticated predicate access and public login branding; it is not applied. Do not mass-revoke the remaining authenticated helper grants or change Auth settings without reviewing their intended callers.
- Fresh catalog query confirmed `school_applications_anon_insert` exists, the live application enum contains only its four base states, and the legacy four-argument `record_school_application_email_delivery` function is absent. The workflow migration's conditional drop is therefore a no-op on this project.
- Billing/operations RPCs required by the pending migrations (`create_subscription_checkout`, `finalize_subscription_payment`, `manage_school_application`, feature-flag and health/backup recording RPCs) are not present remotely.

| Live detail | Status | Evidence / limitation |
|---|---|---|
| Relevant table presence and selected columns | PASS | Fresh `information_schema.columns` query confirms existing base relations/columns; pending-created relation names returned no column rows. |
| Application policy and enum prerequisites | PASS | Fresh catalog query confirmed `school_applications_anon_insert` and only the four base enum labels. |
| Existing RPCs and selected execute grants | PASS | Fresh catalog query confirmed `apply_payment_event` is service-role-only, `approve_school_application` authenticated-only, and `has_school_billing_role` executable by `anon`, `authenticated`, and `service_role`. |
| Live subscription plan rows | PASS | Fresh read-only count returned zero, consistent with the expected pending catalog seed. |
| Direct `PUBLIC` table/column ACLs and inherited API-role memberships | PASS | Fresh linked read-only catalog queries returned no direct `PUBLIC` grants on the four target tables/columns and no inherited memberships for the three API roles. |
| Existing relation RLS, policies, constraints, indexes, and triggers | PASS | Fresh linked catalog inventory completed for the existing application, billing, fee, identity, platform, and audit dependencies. The 15 inspected relations have RLS enabled and not forced; fee-ledger constraints/indexes/triggers were retrieved. |
| Existing RPC definitions and execute privileges | PASS | Definitions were reviewed for payment finalization, application approval, school-role predicates, and platform-admin authorization. Current role grants are recorded above; service-only fee finalization and authenticated-only application approval were confirmed. |
| Security advisor review | BLOCKED | Read-only advisor returned 79 WARN findings (34 anonymous SECURITY DEFINER grants, 43 authenticated grants, and 2 Auth setting warnings). Catalog review mapped the anonymous findings to 13 trigger functions, 20 predicates covered by the pending hardening migration, and intentionally public login branding. Migration and Auth setting changes remain unapplied. |
| Migration dry run and order | PASS | `supabase db push --linked --dry-run` listed all 9 pending files in the order above. No push was performed. |
| Backup inventory and recovery readiness | BLOCKED | `supabase backups list --project-ref fxdnkdyqdwxtgtbylxcr` returned an empty backup list, `pitr_enabled=false`, and no physical backup data. A restricted local logical export of public schema/data and role metadata was created, but it is not a verified project-wide recovery point: the role-only export contains no `CREATE ROLE` statements, and no restore was completed. |
| Separate staging target | BLOCKED | No separate staging project exists in the current project context. A representative non-production target is recommended before applying to the existing data-bearing project; none was created. |
| Fresh isolated local Supabase full-chain test | PASS | Docker 29.8.2 was available. A unique disposable local project applied all 66 migrations; post-migration role/schema checks passed. Its containers, volume, and temporary files were removed. |
| Restore test of current-project logical export | BLOCKED | Docker Desktop's current backend log records `wsl.exe --unmount docker_data.vhdx` failing with `0xffffffff` / “The disk failed to detach: Operation not permitted”; `docker ps` did not return within 60 seconds. `docker info` responds, WSL2 is enabled, and `docker-desktop` is running, but C: had only 0.39 GB free and D: 142.41 GB. `daemon.json` contains only `builder` and `experimental` top-level sections; no safe config repair was indicated. No local `psql`, `postgres`, `initdb`, or `pg_ctl` tools are available. No WSL shutdown, VHDX detach/repair, reset, or prune was attempted. The earlier empty-baseline 66-migration chain test is separate and does not validate restoration of this project's export. |
| Connected development migration apply | BLOCKED | Not run, as required. The connected project contains data and must not be treated as disposable; the supported backup inventory is empty and a verified recovery path is unavailable. |

The export-trigger count was rechecked without displaying SQL contents. Its 58 ordinary trigger statements plus 4 constraint-trigger statements equal the 62 non-internal public triggers returned by the live catalog. The earlier 4-versus-62 discrepancy was caused by counting only ordinary `CREATE TRIGGER` statements; it is not evidence of 58 missing triggers. This resolves that scan discrepancy, but does not establish a complete, restorable project backup.

### Safe migration sequence and recovery

1. **Do not apply to the connected project yet.** It contains existing data; the supported inventory lists no physical backups and PITR is disabled. The first prerequisite is an approved backup/recovery arrangement that covers the affected database and a demonstrated restore path. No remote backup setting, restore, or migration was performed; the local export restore attempt stopped before loading data.
2. Use a separate non-production target with representative data for additional compatibility testing; none currently exists, and none was created. A local disposable full-chain test does not substitute for a restore test or target-specific verification.
3. The local policy correction, fixture, disabled flag seeds, and ordered migration contracts have passed the recorded checks. After recovery readiness and target selection, obtain separate explicit approval and repeat target-specific catalog prechecks.
4. Keep the linked dry-run order. The enum-status migration must remain before workflow functions that reference the added enum labels; `20261019000001` must follow migrations creating `platform_admins.team` and application workflow columns.
5. Only after the recovery prerequisite, non-production validation, and separate approval may an approved target receive the reviewed migration set in order; verify schema/RPC/policy/index/trigger and authorization behavior afterward. Production requires a separate production preflight and approval. Do not push the pending set blindly.

Commands prepared, **not run against production**:

```powershell
# Read-only linked role/server probe:
npx supabase db query --linked "select current_user, current_setting('server_version') as server_version"
# After explicitly linking to an approved non-production project:
npx supabase migration list --linked
npx supabase db push --linked --dry-run
# Only after review and approval for that non-production project:
npx supabase db push --linked
npx supabase migration list --linked
```

There is no safe generic down-migration for this set. Treat schema/data changes as forward-only; retain a verified backup and use a reviewed corrective migration or approved restore plan if a post-apply check fails. The enum labels and any created billing/application records especially should not be treated as trivially reversible.

## Stage 3 — Reconcile backend functions

**Stage status: BLOCKED** — causes for the four named missing endpoints are confirmed; the separate Administrator Workspace runtime failures and server logs remain unverified.

All five deployed functions report `verify_jwt=true`. No per-function `verify_jwt` overrides are configured in `supabase/config.toml`. The four missing local functions handle `OPTIONS`; their remote `OPTIONS` requests return **404 before the function can run**. The five deployed functions returned **200** with CORS headers on the same preflight probe.

A fresh linked function inventory confirmed the same five active functions and JWT verification: `approve-school-application` v8, `start-fee-payment` v3, `settle-fee-payment` v3, `complete-password-change` v2, and `send-invitation` v5. The local fee-function source is newer than deployed versions; no function was deployed.

| Function / workflow | Local source | Remote result | Dependency / cause and next requirement |
|---|---|---|---|
| `subscription-checkout` | Present; caller is `subscriptionBillingService.ts` | Missing; OPTIONS 404 | Confirmed deployment gap, plus missing platform invoice/payment tables, feature flag and checkout RPCs. Apply and verify the prerequisite migrations in order, configure sandbox-only server secrets, then deploy. |
| `platform-health-check` | Present; caller is `platformControlsService.ts` | Missing; OPTIONS 404 | Confirmed deployment gap, plus missing health-check relation and recorder RPC from `20261019200000`. Requires standard Supabase function secrets and active platform-admin authorization. |
| `platform-backup-status` | Present; caller is `platformControlsService.ts` | Missing; OPTIONS 404 | Confirmed deployment gap, plus missing backup relation and recorder RPC from `20261019200000`. Also requires `SUPABASE_ACCESS_TOKEN` for the Supabase Management API; that secret name was absent from the linked secret inventory. |
| `manage-school-application` | Present; caller is `ApplicationsManagement.tsx` | Missing; OPTIONS 404 | Confirmed deployment gap, plus missing workflow columns/private tables and RPC from `20261014000002`. Applicant email actions intentionally fail closed until delivery verification is configured. |
| `approve-school-application` | Present | Deployed; OPTIONS 200 | Existing function and base RPC are available. The pending approval migration is required for the newer `awaiting_information` state. Authenticated request behavior was not exercised. |
| `start-fee-payment` | Present | Deployed; OPTIONS 200 | Existing student-fee endpoint; fee/payment tables and service-role event RPC exist. Local source changes are not deployed. No sandbox settlement was performed. |
| `settle-fee-payment` | Present | Deployed; OPTIONS 200 | Existing fee settlement endpoint. No authenticated sandbox settlement or reconciliation test was performed. |
| `send-invitation` | Present | Deployed; OPTIONS 200 | Preflight is healthy. The reported Administrator Workspace failure was not reproduced with an authenticated invocation or provider logs, so its runtime cause is **NOT VERIFIED**. |
| `complete-password-change` | Present | Deployed; OPTIONS 200 | Preflight is healthy. Authenticated behavior for the reported Administrator Workspace error is **NOT VERIFIED**. |

The browser client uses the configured project URL (the two Vite values were not printed). Client error handling now distinguishes a fetch/CORS/deployment reachability error from a Supabase relay or HTTP response error. The installed Supabase CLI exposes no Edge Function logs subcommand; no log-based diagnosis is claimed.

### Function deployment order after a successful non-production migration

Deploy only after the relevant RPCs, tables, grants, and RLS checks pass. These commands are prepared for an explicitly linked non-production project and were **not run**:

```powershell
npx supabase functions deploy manage-school-application --project-ref <NON_PROD_REF>
npx supabase functions deploy platform-health-check --project-ref <NON_PROD_REF>
npx supabase functions deploy platform-backup-status --project-ref <NON_PROD_REF>
npx supabase functions deploy subscription-checkout --project-ref <NON_PROD_REF>
npx supabase functions deploy start-fee-payment --project-ref <NON_PROD_REF>
npx supabase functions deploy settle-fee-payment --project-ref <NON_PROD_REF>
```

The two fee functions are deployed together because they share the changed provider adapter. Before sandbox checkout, configure only server-side sandbox merchant settings and verify the exact endpoint. Before backup status can succeed, configure the least-privilege Supabase Management API token. Do not copy either secret into a `VITE_` variable. Re-run `functions list`, authenticated health/application/billing smoke tests, and preflight checks after each deployment batch.

## Stage 4 — Validate database and backend changes

**Stage status: BLOCKED**

| Item | Status | Evidence |
|---|---|---|
| Frontend and contract/migration tests | PASS (LOCAL ONLY) | Targeted migration and payment-flow contract tests passed **19/19**. The first full run had **72 pass / 1 fail** because the cold browser navigation to `/platform` exceeded its 30-second timeout; the route test then passed in isolation, and the full rerun passed **73/73**, 0 failures, 0 timeouts. These are not remote migration or live payment integration tests. |
| Type/lint check | PASS | Current `npm run lint` passed. |
| Production frontend build | PASS | Current `npm run build` passed. Vite emitted the existing large-chunk warning (ExcelJS and main JavaScript bundles); no build error occurred. |
| Diff whitespace check | PASS | Current `git diff --check` passed. Git reported LF-to-CRLF conversion warnings only. |
| Edge Function runtime type-check | PASS (LOCAL ONLY) | Installed Deno 2.9.8 from the official `DenoLand.Deno` Winget package; `deno check` passed for all 9 function entrypoints, including `subscription-checkout` and `platform-backup-status`. |
| Preview deployment | BLOCKED | Vercel CLI 65.1.0 is available from a D:-drive npm cache, and `.vercelignore` now excludes environment files, local Supabase state, private backup folders, docs/tests, the Deno lockfile, and the protected history path without inspecting it. `vercel whoami` reports **Logged out** and `.vercel/project.json` is absent, so the existing `nomcloud` project cannot yet be linked or deployed. The initial default-cache CLI install failed with `ENOSPC` because C: had no free space; using D: resolved installation, not authentication. No preview was deployed. |
| Remote migration/RLS validation | BLOCKED | Read-only linked catalog inventory, migration list, and dry-run succeeded. The original intermittent temporary-role authentication error did not reproduce and its exact cause remains unverified. Remote migration application was intentionally not performed; the connected project contains data and requires separate approval and a verified recovery plan. |

## Stage 5 — Finish the WaafiPay sandbox integration

**Stage status: BLOCKED**

| Item | Status | Evidence |
|---|---|---|
| Separate fee and subscription ledgers | PASS | Student fees use `payment_events` / `fee_payments`; subscriptions use `platform_invoices` / `platform_payments`. No cross-ledger write is present in the inspected code. |
| Shared provider adapter and sandbox endpoint restriction | PASS | Shared adapter supports purchase/preauthorization/commit/cancel and refuses non-sandbox endpoints. |
| Subscription pricing, invoice, and finalization contract | PASS (local contract only) | Catalog prices come from the database; checkout is idempotent; server finalization checks provider approval, reference, amount, currency, and IDs before activation. See `docs/integration/SUBSCRIPTION_BILLING_BACKEND_CONTRACT.md`. Migration and function are not deployed. |
| Enterprise enquiry | PASS (local path only) | Enquiry is validated and saved to `contact_messages`; it does not claim an email was delivered or activate Enterprise. Remote execution is blocked by the missing function deployment. |
| Fee start/settlement recovery | BLOCKED | Start calls the provider before a durable pending event is recorded. A provider timeout after acceptance can lose the provider reference. No status-query/webhook reconciliation path is present; unresolved attempts intentionally block blind retries. |
| Subscription pending/unknown recovery | BLOCKED | Pending/unknown attempts prevent duplicate checkout, but no provider status-query/webhook reconciliation path was found; unresolved attempts can remain blocked for operator recovery. |
| Merchant secrets and sandbox account | BLOCKED | A filtered name-presence check found no WaafiPay credential names or `WAAFIPAY_MODE`, and no `SUPABASE_ACCESS_TOKEN`. The CLI unexpectedly returned value fields during an initial inventory; no values were copied into repository files. Treat the command transcript as sensitive if it is visible outside the authorized operator context. |
| Webhooks, signature checks, and provider status polling | NOT VERIFIED / NOT IMPLEMENTED | No receiver or reconciliation function exists locally. Provider docs were reviewed previously for signed webhook support; exact merchant response behavior and callback delivery remain unverified. |

## Stage 6 — End-to-end acceptance tests

**Stage status: BLOCKED**

| Scenario | Status | Evidence |
|---|---|---|
| Mock contract: approved/declined/pending/unknown and idempotency | PASS | Covered by local provider, checkout, and migration-contract tests. |
| Real WaafiPay sandbox payment for student fees | NOT VERIFIED | No merchant credentials/account and no transaction. |
| Real WaafiPay sandbox payment for school subscriptions | NOT VERIFIED | Checkout function/migration are absent remotely; no merchant credentials/account and no transaction. |
| Cross-school, unauthorized, mismatch, duplicate callback/retry, and reconciliation behavior against deployed services | NOT VERIFIED | Local contracts cover selected guards; no authenticated remote integration environment or provider callback was exercised. |

## Stage 7 — Verify workspaces and user experience

**Stage status: BLOCKED**

| Surface | Status | Evidence |
|---|---|---|
| Subscription & Billing UI behavior | PASS (automated contract only) | Tests verify backend-backed data, honest error/empty states, and success only after server confirmation. Remote checkout endpoint and billing tables are missing. |
| Parent Fees UI behavior | PASS (automated contract only) | Tests verify service invocation and success only after an applied ledger result. Remote authenticated payment behavior was not exercised. |
| Platform Operations UI | NOT VERIFIED against current remote schema | Local tests pass; remote operations/health/backup relations and functions are absent. |
| School Applications UI | NOT VERIFIED against current remote schema | Local workflow tests pass; remote workflow migration/RPC and function are absent. |
| Administrator Workspace | NOT VERIFIED | Deployed endpoint preflights succeed, but no authenticated failing request, browser reproduction, or server log evidence was obtained. |

## Stage 8 — Release readiness

**Stage status: BLOCKED**

Latest verification (2026-10-22): `npm run test:operator-workspace` passed **73/73**, `npm run lint` passed, `npm run build` passed with the existing large-chunk warning, and all 9 Edge Function entrypoints passed Deno type-checking. Release readiness remains blocked by unapplied remote migrations, missing remote functions, missing sandbox credentials, absent payment reconciliation, an unverified restore path, Vercel sign-in/linking, and unverified authenticated Administrator Workspace errors.

## Stage 9 — Production release

**Stage status: BLOCKED — separate approval required**

No production migrations, function deployments, secret changes, payments, commits, or pushes were performed. Prepare a production runbook only after Stages 1–8 have evidence-based acceptance and obtain a separate explicit production approval.

## Current preserved-work and execution record

- Working tree remains unstaged; all previously present modified and untracked files were preserved.
- No stash was changed.
- No production migration, deployment, secret update, commit, or push was performed.
- Stage 2B corrected the local policy name and migration fixture; Stage 2C verified the replacement policy and checkout ordering; Stage 2D set the four new feature-flag seed values to disabled and added tests for their initial state.
- Stage 2D targeted migration-contract tests passed 15/15, the full Operator Workspace suite passed 72/72, and `git diff --check` passed.
- Stage 2E confirmed 57 applied and 9 pending migrations, with the dry-run matching the ledger. The supported backup inventory returned no physical backups and PITR disabled; coverage, a target-specific restore path, and a restore test remain unverified. Stage 2 is **BLOCKED** pending approved and demonstrated recovery readiness.
- The latest private logical export's trigger statement count was reconciled to the live catalog (58 ordinary plus 4 constraint triggers = 62). Its role-only file has no `CREATE ROLE` statements, and an isolated restore attempt stopped before loading data because Docker Desktop could not start; this export is not a verified recovery point.
- The subscription billing backend contract is documented at `docs/integration/SUBSCRIPTION_BILLING_BACKEND_CONTRACT.md`. Payment endpoint errors now return safe client messages and log only error type/code; the focused regression test passed.
- Current targeted migration/payment contracts passed 19/19; `npm run lint`, `npm run build`, `git diff --check`, and the final `npm run test:operator-workspace` rerun passed. The first full-suite attempt had one cold-start route timeout (72/73); the isolated browser route rerun passed 1/1 and the subsequent full suite passed 73/73.
- Fresh read-only preflight reconfirmed 57 applied migrations and the same 9 pending migrations in dry-run order. No remote migration was applied. The security advisor's 79 WARN findings were reviewed and classified; the pending hardening migration has not been applied.
- Deno 2.9.8 was installed via Winget, all 9 Edge Function entrypoints now pass `deno check`, and the focused migration/payment/platform contracts pass 23/23. Deno generated `deno.lock` to pin the checked remote imports; it is excluded from the Vercel frontend upload. `platform-backup-status/index.ts` now types its recorder helper from the locally inferred service client rather than an incompatible generic `ReturnType`.
- The current active remote function set is unchanged: `approve-school-application` v8, `start-fee-payment` v3, `settle-fee-payment` v3, `complete-password-change` v2, and `send-invitation` v5; all have `verify_jwt=true`. No function was deployed.
- Docker data/configuration was not changed. At the earlier check, the backend log's safe failure signature was WSL VHD detach `0xffffffff` / operation not permitted and C: had 0.39 GB free. No Docker reset, prune, WSL shutdown, or VHDX repair was attempted.
- Added `.vercelignore` to keep environment files and local/private artifacts out of preview uploads. Vercel CLI 65.1.0 was installed using a D:-drive npm cache, but `vercel whoami` reports **Logged out**; no `.vercel/project.json` was created and no preview deployment occurred.
- No remote migration, function deployment, application preview, secret update, commit, or push was performed. The task-created restore scratch directory was removed; the restricted logical export remains outside the repository.

### 2026-10-22 follow-up — disk space, Docker health, and fresh validation

- C: now has **6.74 GB free** (up from 0.40 GB); D: has **142.53 GB free**. The increase alone does not establish that Docker's virtual disk has sufficient healthy capacity.
- Docker Desktop/backend processes are running, the active context is `desktop-linux`, and WSL reports `docker-desktop` running with Ubuntu stopped. However, bounded read-only calls to `docker info`, `docker ps`, and `docker system df` each timed out after 20 seconds. Docker storage usage and daemon health therefore remain unverified; no Supabase instance was started.
- The existing `daemon.json` parsed successfully and has no explicit `data-root`, storage-driver, containerd-snapshotter, or log-level setting; it was not modified.
- Docker's `init.log` records EXT4/buffer I/O errors on device `sdd`, including journal and superblock write failures. At the same time, containerd content-ingest and metadata writes failed with `read-only file system`. Docker/WSL logs subsequently show `docker_data.vhdx` attach/unmount failures with exit `0xffffffff` and “Operation not permitted.” This verifies the immediate failure chain (block I/O errors → container filesystem read-only → containerd writes fail → VHD detach/attach failure), but does not establish the underlying host/VHD fault. The bounded Windows System event query found no corroborating recent disk/NTFS error; NTFS reported host volumes healthy on its latest checks, which does not prove the Docker VHD is healthy.
- Docker configuration and storage were not repaired or reset. No containers, images, volumes, WSL distributions, or Docker data were deleted; no prune or local Supabase startup was attempted. Do not retry local Supabase until Docker queries respond normally and storage capacity/integrity are established.
- Fresh local checks passed: Deno 2.9.8 type-checked **9/9** Edge Function entrypoints; `npm run test:operator-workspace` passed **73/73** with no failures, cancellations, or skips; `npm run lint` and `npm run build` passed. The build retains its existing >500 kB chunk warning. `git diff --check` passed after the final checklist update for tracked changes; the release checklist itself is untracked.
- Vercel remains **logged out**, and `.vercel/project.json` is absent. No preview was deployed and no new URL exists; do not use an unlinked temporary deployment as a substitute for the existing `nomcloud` project.
- The last verified remote ledger remains **57 applied / 9 pending**, with the previously matching dry-run order. No remote migration was applied in this continuation. Backup/PITR and isolated restore readiness remain unverified; local restore validation is still blocked by unhealthy Docker storage.
- **Next actions:** establish Docker Desktop/VHD health and sufficient usable storage using a non-destructive supported diagnostic/recovery path, then recheck `docker info`, `docker ps`, and `docker system df` before considering local Supabase. Complete Vercel CLI/browser sign-in and link the existing `nomcloud` project before a preview-only deployment. Keep remote migrations blocked until a complete recovery point is demonstrated by an isolated restore and compatibility gates pass; obtain separate explicit approval before applying any remote migration. Do not deploy dependent functions until prerequisite migrations and runtime checks pass.
