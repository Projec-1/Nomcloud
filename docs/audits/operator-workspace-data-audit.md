# Operator Workspace data and action audit

## Scope and evidence boundary

This audit covers the Operator Workspace in the current local worktree: its `/platform` routes, section components, service calls, local migrations, and the linked Supabase project’s read-only metadata. It does not inspect user records, secrets, or the contents of `.aider.chat.history.md`, and it makes no database or deployment changes.

The route tree is protected by `PlatformRoute`, which checks that the signed-in account is a platform administrator. The guard itself explicitly says it is navigation convenience only; database RLS remains the authorization boundary ([App.tsx:116](../../src/App.tsx#L116), [PlatformRoute.tsx:7](../../src/routes/PlatformRoute.tsx#L7)).

### Data classification

- **A — Live-backed read:** a Supabase or authenticated identity-provider read.
- **B — Derived live view:** a count, filter, summary, or export derived from records already read.
- **C — Live-backed write:** a durable database, RPC, or Edge Function operation, subject to deployed schema, policy, and function availability.
- **D — Device-only:** browser-local preference; it does not synchronize or cause a server-side action.
- **E — Unavailable:** explicitly not connected; no operational result is represented as successful.
- **F — Prototype-only data:** fabricated examples must not be rendered as production records.

## Executive findings

1. **The workspace is not uniformly a prototype.** Schools, school-scoped counts and subscriptions, audit rows, operator grants, contact messages, and the base school-application queue are backed by Supabase in source. Overview and Action Center summarize those returned records. School status and contact-message handling are real writes in source.
2. **Some platform-wide capabilities remain unavailable, but several sections now use the real records already loaded for the workspace.** People shows school contact details (not a complete people directory); Analytics shows a current derived snapshot (not historical reporting); Activity shows audit rows (not a unified event stream); Billing shows subscription-plan labels (not invoices or reconciliation); Permissions shows platform-admin grants (not a role matrix); and Security reads MFA state for the signed-in operator only. Communications, automated monitoring, maintenance, backups, governed data jobs, feature flags, and cross-account security remain unavailable.
3. **Do not equate “no platform billing ledger” with “no billing data.”** Local schema migrations define a subscription-plan catalog, school subscriptions, fee records/payments, and payment events. These are not a platform-wide invoice/reconciliation ledger and are not connected to the Operator Billing screen ([platform core](../../supabase/migrations/20260903000002_platform_core.sql#L42), [school subscriptions](../../supabase/migrations/20260904000002_schools.sql#L174), [fee payments](../../supabase/migrations/20260904000010_finance.sql#L157), [payment events](../../supabase/migrations/20260915000002_payment_events.sql#L116)).
4. **New operations and application-workflow code is ahead of the linked database history.** Remote migration `20260927191153` is named `teacher_date_of_birth_and_gender`; its stored statement hash matches the local `20260927000001_teacher_date_of_birth_and_gender.sql` body after stripping full-line comments, and its live effects are verified. The local application-workflow and operations versions have no remote ledger entries. The worktree operations migration now uses `20261011000002`, but `origin/main` still contains `20261011000001_platform_operations.sql` alongside the billing migration at `20261011000001`; the unfinished merge must preserve the replacement to eliminate that collision.
5. **Read-only Dashboard catalog checks now confirm the deployment gap and key dependencies.** `platform_cases`, its event table, and all local platform incident tables are absent. Existing dependency columns and base platform-admin RLS policies exist. No operations-table policies or operations RPCs are deployed. The live `is_platform_admin()` function is a `SECURITY DEFINER` function with an empty search path and checks for a non-revoked admin grant. No business records were queried.
6. **Source-level truth and result-reporting gaps were corrected locally:** direct updates now require a returned row; reviewer-action descriptions, Billing/Health/Activity/Settings claims, audit empty-state copy, and shared-load stale/zero states were corrected. The Operations Queue also suppresses zero-valued KPIs and the misleading empty-queue message on failure. Full review of the proposed operations migration found and corrected two additional edge cases: preserving non-`handled` contact-message statuses and rejecting responder replacement for a nonexistent incident.

## Approved decisions and current local preparation (2026-10-19)

The user-approved decisions supersede the earlier deployment choices described
in this audit:

- School subscription reads remain restricted to active owners and directors;
  active school administrators are not added to the billing authorization
  helper.
- Subscription plans remain private to platform administrators. The local
  billing migration removes the public plan policy, revokes anonymous table
  privileges, and retains the authenticated admin-only RLS boundary.
- The default operations migration does not copy historical contact-message
  content into cases. A separate opt-in backfill script is prepared but is not
  approved or executed. New messages may still synchronize after the
  operations migration is deployed.
- Applicant review communications (request-information, rejection, and
  templates) remain disabled. The local management Edge Function fails closed,
  the workflow RPC rejects email-dependent actions, and the delivery recorder
  is restricted to `service_role`. Provider acceptance is distinct from
  delivery; delivered requires a provider event ID. A verified provider
  webhook/signature path is not implemented, so these communications must not
  be enabled.
- The separate existing approval/resend activation-invitation function remains
  server-side. Its result means Supabase Auth accepted the invite/recovery
  request, not that the inbox delivery was confirmed; the UI now says so. That
  deployed function was not modified or redeployed.

These are local SQL/source changes only. The organization dashboard showed one
project and no separate staging project; no write tests were run against the
linked production project. The in-progress Git merge is not finalized, and no
commit, push, migration, or function deployment was performed. The prior
lint/build results below predate these newest changes; rerun them before
describing the current worktree as validated.

## Section-by-section inventory

Routes are registered under the guarded `/platform` route in [App.tsx:116](../../src/App.tsx#L116); navigation and section dispatch are in [Workspace.tsx:93](../../src/pages/platform/Workspace.tsx#L93) and [Workspace.tsx:472](../../src/pages/platform/Workspace.tsx#L472).

| Section / route | Class | Verified source and actual behavior |
|---|---|---|
| Overview `/platform` | A, B | Loads schools, contact messages, audit rows, operators, and pending application count. KPIs, alerts, school/request lists, and CSV are derived from those rows. No prototype chart is needed. ([Workspace.tsx:200](../../src/pages/platform/Workspace.tsx#L200), [platformService.ts:74](../../src/services/platformService.ts#L74), [OverviewSection.tsx:59](../../src/pages/platform/operator/OverviewSection.tsx#L59)) |
| Action Center `/platform/actions` | A, B | Derives pending application, open contact-message, and suspended-school items. Opening each item navigates to or opens its real record; the component expressly does not simulate assignment/resolution. ([ActionCenterSection.tsx:37](../../src/pages/platform/operator/ActionCenterSection.tsx#L37), [ActionCenterSection.tsx:72](../../src/pages/platform/operator/ActionCenterSection.tsx#L72)) |
| Schools `/platform/schools` | A, B, C | Reads `schools`, active administrator memberships/profiles, `school_subscriptions`/plan names, student/teacher counts, and recent audit timestamps. The profile modal exposes a confirmed suspend/reactivate action writing `schools.status`, `suspended_at`, and `suspension_reason`. ([platformService.ts:74](../../src/services/platformService.ts#L74), [platformService.ts:248](../../src/services/platformService.ts#L248), [SchoolProfileModal.tsx:67](../../src/pages/platform/SchoolProfileModal.tsx#L67)) |
| People `/platform/people` | B | Shows school administrator/contact values from the already-loaded school rows and opens the actual school record. It is explicitly not a complete teacher/guardian/membership directory. |
| Requests & Reviews `/platform/requests` | A, C | Reads real `contact_messages`; can open stored details and mark a message handled. Reviewer assignment, replies, escalation, and rejection are not implemented. ([platformService.ts:216](../../src/services/platformService.ts#L216), [platformService.ts:240](../../src/services/platformService.ts#L240), [RequestsSection.tsx:26](../../src/pages/platform/operator/RequestsSection.tsx#L26)) |
| School Applications `/platform/applications` | A, C; deployment-blocked for parts | Reads `school_applications` and application detail/history tables. Approval uses `approve-school-application`; richer reviewer/document/email actions invoke `manage-school-application` and local workflow migrations. The former was not in the linked deployed function list, and the 20261014 workflow migrations are absent from the linked migration history. Those actions cannot be declared live-verified. ([ApplicationsManagement.tsx:454](../../src/pages/platform/ApplicationsManagement.tsx#L454), [ApplicationsManagement.tsx:682](../../src/pages/platform/ApplicationsManagement.tsx#L682), [ApplicationsManagement.tsx:857](../../src/pages/platform/ApplicationsManagement.tsx#L857)) |
| Communications `/platform/communications` | E | No platform-wide composer, delivery provider, or delivery history. Existing announcements and messaging are school-scoped. ([CommunicationsSection.tsx:6](../../src/pages/platform/operator/CommunicationsSection.tsx#L6)) |
| Operations Queue `/platform/operations/*` | C; deployment-blocked | Reads and writes cases/events through `platformOperationsService`. Local migration defines `platform_cases`, case events, RLS policies, validation, and audit triggers. Live catalog confirms these relations and policies are absent. The queue exposes the error and does not claim an empty result. ([Workspace.tsx:479](../../src/pages/platform/Workspace.tsx#L479), [platformOperationsService.ts:66](../../src/services/platformOperationsService.ts#L66), [platform_operations.sql:279](../../supabase/migrations/20261011000002_platform_operations.sql#L279)) |
| Analytics `/platform/analytics` | B | Derives a current snapshot from the loaded school, contact-message, application-count, and operator records. It does not claim historical trends, revenue, retention, or usage analytics. |
| Activity `/platform/activity` | A, B | Reads the same latest audit records as Audit Logs and supports search/load-more within that result. It is explicitly not a complete feed of deliveries, security events, or telemetry. |
| Audit Logs `/platform/audit` | A, B | Reads append-only `audit_logs`, filters and exports loaded rows, and has no browser mutation path. Local operations migration adds audit triggers for operations events. School-status writes have no audit trigger; contact-message updates are synchronized to audited operation cases only when that migration is installed. ([platformService.ts:179](../../src/services/platformService.ts#L179), [AuditSection.tsx:39](../../src/pages/platform/operator/AuditSection.tsx#L39), [platform_operations.sql:391](../../supabase/migrations/20261011000002_platform_operations.sql#L391)) |
| System Health `/platform/health` | E plus C for manual incident records | Automated telemetry, job health, and alert thresholds are unavailable. The page also hosts a distinct, operator-authored incident-command workflow backed by local `platform_incidents` tables; an operator-recorded incident is not an automated health signal. ([Workspace.tsx:488](../../src/pages/platform/Workspace.tsx#L488), [HealthSection.tsx:6](../../src/pages/platform/operator/HealthSection.tsx#L6), [IncidentCommand.tsx:36](../../src/pages/platform/IncidentCommand.tsx#L36)) |
| Maintenance `/platform/maintenance` | E | No server-enforced maintenance switch, schedule, or job source; actions are not simulated. ([MaintenanceSection.tsx:6](../../src/pages/platform/operator/MaintenanceSection.tsx#L6)) |
| Security `/platform/security` | A, E | Reads current authentication assurance and verified MFA factors for the signed-in operator through Supabase Auth. It does not read other operators’ factors, security events, session history, access reviews, or offer containment. |
| Permissions `/platform/permissions` | A, B, E | Displays the real platform-admin grant rows and active/revoked status already loaded for Operators. No general permission matrix, approval workflow, or mutation exists. |
| Operators `/platform/operators` | A, B | Reads `platform_admins` and linked profiles; calculates active grants and exports records. It does not invite, revoke, or change access in this section. ([platformService.ts:266](../../src/services/platformService.ts#L266), [OperatorsSection.tsx:19](../../src/pages/platform/operator/OperatorsSection.tsx#L19)) |
| Features `/platform/features` | E | No feature-flag, rollout, override, or adoption source; no toggle is offered. ([FeaturesSection.tsx:6](../../src/pages/platform/operator/FeaturesSection.tsx#L6)) |
| Integrations `/platform/integrations` | E | No integration registry, credential-status read, webhook endpoint, or delivery log. Credentials correctly remain outside the browser. ([IntegrationsSection.tsx:6](../../src/pages/platform/operator/IntegrationsSection.tsx#L6)) |
| Billing `/platform/billing` | B, E for platform ledger | Derives plan-label counts from the joined subscription labels on loaded school rows. It does not show invoices, payments, or reconciliation; those platform-ledger sources remain unavailable. ([BillingSection.tsx](../../src/pages/platform/operator/BillingSection.tsx), [subscriptionService.ts](../../src/services/subscriptionService.ts), [finance migrations](../../supabase/migrations/20260904000010_finance.sql)) |
| Data `/platform/data` | E | No governed platform export/import job or access/deletion request register; no browser-only fake request is created. ([DataSection.tsx:6](../../src/pages/platform/operator/DataSection.tsx#L6)) |
| Backups & Recovery `/platform/backups` | E | No backup job, run, restore test, or recovery-objective source; no backup/restore action is offered. ([BackupsSection.tsx:6](../../src/pages/platform/operator/BackupsSection.tsx#L6)) |
| Settings `/platform/settings` | A, C, D, E | Identity and platform counts are read-only. Password reset calls Supabase Auth. Theme, language, and notification switches are device-local; notification toggles do not deliver messages. Editing profile, session history, and emergency controls are unavailable. ([SettingsSection.tsx:59](../../src/pages/platform/operator/SettingsSection.tsx#L59), [SettingsSection.tsx:120](../../src/pages/platform/operator/SettingsSection.tsx#L120), [SettingsSection.tsx:132](../../src/pages/platform/operator/SettingsSection.tsx#L132), [ThemeContext.tsx:39](../../src/context/ThemeContext.tsx#L39), [LanguageContext.tsx:16](../../src/context/LanguageContext.tsx#L16)) |

### Prototype data check

`operator/prototypeData.ts` still contains example arrays, including billing, health, security, integration, and webhook examples. There are no imports of that file elsewhere in the Operator Workspace source, and `Workspace.tsx` does not import it. Keep it out of production rendering; do not delete it solely because it is currently unused. (**F: not rendered in the audited path.**)

## Authorization, auditability, and write behavior

- Dashboard catalogs confirm the local operations migration's existing dependencies: profiles, platform-admin grants, schools, contact messages, and audit logs. The live `is_platform_admin()` function checks the signed-in user against a non-revoked grant; `set_updated_at()` also exists. `platform_cases`, case events, incidents, responders, and updates are absent, so no policies exist for those new relations.
- Live base policies include `audit_logs_platform_admin_all`, `contact_messages_platform_admin_all`, and `platform_admins_platform_admin_all`, each using `is_platform_admin()`. Existing operations policies remain unverified because the relations are absent.
- Audit logs are configured append-only in local migrations; the client only reads them. School-status updates have no audit trigger. The local operations migration prepares an indirect contact-to-case-to-audit path, but that path is not deployed.
- Several direct update methods checked only the Supabase `error`. A zero-row update (for example, a row deleted concurrently or hidden by RLS) can therefore look successful to the caller. The local correction makes those methods require a returned row and propagates an explicit failure.
- The shared Workspace loader uses `Promise.all`; a single failed query invalidates the combined load. On failure, relevant collections are cleared and the UI must not show zeros or empty-state claims as if the read succeeded.

## Linked Supabase evidence and migration status

Read-only management-plane checks succeeded for the linked project:

- The remote `supabase_migrations.schema_migrations` row `20260927191153` is named `teacher_date_of_birth_and_gender`, has one stored statement and a null rollback field. Its statement hash matches the local `20260927000001_teacher_date_of_birth_and_gender.sql` SQL body after full-line comments are removed; safe statement checks and the live catalog confirm the teacher date-of-birth column, gender column, and `teachers_gender_check`. The logical migration identity is confirmed; the timestamp differs. No migration repair or replay was performed.
- The remote ledger has no rows for local versions `20261011000001`, `20261011000002`, or `20261014000001`-`03`. The prepared operations migration uses `20261011000002`, but `origin/main` still has `20261011000001_platform_operations.sql` alongside `20261011000001_subscription_billing_access.sql`. The unfinished merge must retain only the replacement operations version before deployment.
- The live `has_school_billing_role(uuid)` is `SECURITY DEFINER`, has an empty search path, and authorizes active `owner` and `director` memberships only. The school-subscription read policy calls it. `subscription_plans` currently has only its platform-admin policy. The approved local billing migration preserves those boundaries, removes the public plan policy if present, revokes anonymous table privileges, and grants authenticated reads subject to the existing platform-admin RLS policy. The base migration documentation also excludes administrators from commercial data.
- `supabase functions list` returned active functions `approve-school-application`, `start-fee-payment`, `settle-fee-payment`, `complete-password-change`, and `send-invitation`. `approve-school-application` is deployed; `manage-school-application`, which the richer reviewer/document/email actions invoke, was not listed. No platform operations Edge Function was listed; the operations UI instead calls PostgREST/RPC directly.
- Dashboard `information_schema`, `pg_policies`, `pg_proc`, and `pg_constraint` queries succeeded for the relevant dependencies. Live base policies include `audit_logs_platform_admin_all`, `contact_messages_platform_admin_all`, and `platform_admins_platform_admin_all`; there are no operations policies because their relations are absent. The CLI's direct Postgres catalog connection still fails with SQLSTATE `28P01`; no credentials were exposed or changed.
- No `db push`, migration repair, SQL write, Edge Function deploy, commit, amend, push, or deployment was performed.

## HTTP 400 diagnosis and local correction (2026-10-19)

The authenticated local workspace displayed the Supabase/PostgREST error `column platform_admins.team does not exist`. The failing source maps to `fetchPlatformOperators()` in `src/services/platformService.ts`: its GET selected `id, user_id, granted_at, revoked_at, team` plus the `profiles` relation, ordered by `granted_at.desc`. PostgREST returned HTTP 400 because the live `platform_admins` relation has no `team` column.

The live migration ledger does not contain the local operations migration, which adds `platform_admins.team`; that live column is absent. The operations migration now has the unique local version `20261011000002`. No migration was applied. The local read query selects only columns supported by the deployed baseline and marks team metadata unavailable in the incident responder list. This preserves the operator/profile read without hiding the PostgREST error or changing live schema.

The observed `application_status` enum metadata query succeeded and confirmed `pending` is a valid live enum value, so the `school_applications` count filter `status=eq.pending` is not invalid due to that enum. Browser logs also showed HEAD count requests to `school_applications`, `students`, and `teachers` ending as `net::ERR_ABORTED`; that event is a cancelled request, not proof of HTTP 400, and the browser trace did not expose response bodies/statuses for those cancellations. No separate cause is asserted for them.

After the column correction, a browser smoke check on `/platform` and the shared platform-data routes showed no workspace `role=alert`; an instrumented reload captured no HTTP error responses. The browser's historical console log had unrelated 404s, and repeated request-cancellation events should not be reported as 400 responses. No access tokens, cookies, or business-record identifiers are included here.

### Operations Queue and System Health retest

The authenticated browser was retested on `/platform/operations` and
`/platform/health`. Operations Queue still fails because the live table is
absent; the UI displays the schema-cache message and a retry control. Browser
Resource Timing captured
`GET /rest/v1/platform_cases?select=<caseColumns>&order=updated_at.desc` with
status **404** (not 400). The raw response body was not captured. System Health
shows the same missing-table message while loading incident case context.
Live `information_schema` confirms `platform_cases`, `platform_case_events`,
`platform_incidents`, `platform_incident_responders`, and
`platform_incident_updates` are absent. Failed queue reads now show `—` for
KPIs and do not show “No cases match these filters.”

The Dashboard schema checks also verified the operations migration's existing
dependencies: `profiles` has `id`, `full_name`, and `email`; `platform_admins`
has `id` and `revoked_at` but no `team`; `schools` has `id`;
`contact_messages` has the fields used by the intake backfill and uses text
status; and `audit_logs` has the actor/action/entity columns, including JSONB
`changes` and citext `actor_email`. The live `is_platform_admin()` and
`set_updated_at()` functions exist. `is_platform_admin()` is `SECURITY DEFINER`
with an empty search path and only returns true for the authenticated user
with a non-revoked grant. Base platform-admin policies were found on
`platform_admins`, `contact_messages`, and `audit_logs`; no operations policies
or responder RPC are deployed.

## Safe read-only Supabase Dashboard queries

The CLI’s direct Postgres catalog connection still fails with `LegacyDbConfigConnectTempRoleError` / SQLSTATE `28P01` while attempting its temporary login role. The authenticated Dashboard SQL Editor was confirmed against project `fxdnkdyqdwxtgtbylxcr`; the read-only queries below were executed there for the relevant columns, policies, functions, constraints, and migration versions. They return schema/catalog metadata only, not business records or credentials.

### 1. Relations and columns used by Operator Workspace

Verifies which relevant relations and columns actually exist in the live `public` schema; local migrations alone do not prove deployment.

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    table_name in (
      'audit_logs', 'contact_messages', 'memberships', 'platform_admins',
      'school_applications', 'school_subscriptions', 'subscription_plans',
      'students', 'teachers'
    )
    or table_name like '%application%'
    or table_name like 'platform_case%'
    or table_name like 'platform_incident%'
  )
order by table_name, ordinal_position;
```

### 2. Row-level security policies on those relations

Verifies which policies exist, their target roles/commands, and their `USING` / `WITH CHECK` expressions.

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (
    tablename in (
      'audit_logs', 'contact_messages', 'memberships', 'platform_admins',
      'school_applications', 'school_subscriptions', 'subscription_plans',
      'students', 'teachers'
    )
    or tablename like '%application%'
    or tablename like 'platform_case%'
    or tablename like 'platform_incident%'
  )
order by tablename, policyname;
```

### 3. Application and platform-operations RPC metadata

Verifies live function names/signatures, return types, whether each function is `SECURITY DEFINER`, and whether `authenticated` has execute permission. It deliberately does not return function bodies.

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%application%'
    or p.proname ilike '%platform_case%'
    or p.proname ilike '%platform_incident%'
    or p.proname ilike '%audit%'
  )
order by p.proname, arguments;
```

### 4. Applied migration versions around the known divergence

Verifies the remote migration versions without modifying migration history. If the history relation is unavailable in the SQL Editor, stop and report that rather than creating it.

```sql
select version
from supabase_migrations.schema_migrations
where version >= '20260927000001'
order by version;
```

### 5. Constraints and indexes for Operator Workspace relations

Verifies foreign keys, check/unique constraints, and index definitions for the
core and operations relations. A relation that is genuinely absent returns no
rows here; a permission or connection failure returns an error and must not be
treated as absence.

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    c.relname in (
      'audit_logs', 'contact_messages', 'memberships', 'platform_admins',
      'school_applications', 'school_subscriptions', 'subscription_plans',
      'schools', 'students', 'teachers',
      'platform_cases', 'platform_case_events', 'platform_incidents',
      'platform_incident_responders', 'platform_incident_updates',
      'school_application_notes', 'school_application_document_events',
      'school_application_communications', 'school_application_events'
    )
  )
order by c.relname, con.contype, con.conname;
```

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'audit_logs', 'contact_messages', 'memberships', 'platform_admins',
    'school_applications', 'school_subscriptions', 'subscription_plans',
    'schools', 'students', 'teachers',
    'platform_cases', 'platform_case_events', 'platform_incidents',
    'platform_incident_responders', 'platform_incident_updates'
  )
order by tablename, indexname;
```

### 6. PostgreSQL enum labels

Lists enum types in `public` without assuming a particular enum type name.
An empty result does not prove a status is invalid; the column may instead use
`text` with a check constraint, which Query 1 and Query 5 expose.

```sql
select n.nspname as schema_name, t.typname as enum_type, e.enumsortorder, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by t.typname, e.enumsortorder;
```

## Local corrections and follow-up requirements

The local corrections made with this audit are intentionally limited to:

- requiring a returned row from school, contact-message, case, incident, and operator-team updates so a zero-row/RLS-filtered update fails visibly;
- clearing stale platform data and hiding affected summaries/search results when the shared platform-record load fails; Settings shows unavailable/loading counts rather than zeros;
- correcting the unsupported reviewer-action description and clarifying that school billing records, manual incidents, audit rows, and operation timelines are distinct from the missing platform-wide ledgers/monitoring/feed;
- correcting the audit empty-state claim, notification-preference description, and Settings statements about configuration audit trails, MFA/security visibility, and session revocation;
- adding read-only views over already-loaded real data for school contacts, current analytics snapshots, audit activity, school subscription-plan labels, and platform-admin grant status; adding current-account Supabase Auth MFA/assurance visibility without implying cross-account monitoring;
- selecting the most recent uncancelled subscription deterministically when deriving a school’s plan label, and clearing stale case/incident rows on load failures;
- identifying contact-message counts as limited to the newest 500 returned rows, and surfacing/retrying case-history read failures rather than retaining stale history;
- preparing the requested operations schema, RLS, validation, and audit paths in the local-only `20261011000002_platform_operations.sql` migration after verifying its live dependencies;
- preserving non-`handled` contact-message status text when a linked case moves between active statuses, and returning an explicit not-found error when responder replacement targets a nonexistent incident;
- showing unavailable Operations Queue KPIs and suppressing the empty-queue message on read failure, and changing the System Health incident tile to “Manual records” rather than implying the feature is available.

The operations migration is a proposed local backend feature, not a statement
that any of its relations or policies are live. No live data or schema was
changed.

The Operations Queue cannot work until the reviewed operations migration is
authorized and deployed. The remote teacher migration identity now matches
the local SQL body, but its version differs and requires an approved,
cross-environment ledger reconciliation before migration tooling runs. The
approved billing and historical-contact decisions are reflected in local
unapplied changes; the optional historical backfill is not approved. The local
application-workflow migrations have no matching remote ledger entries. Do not
resolve these blockers by applying migrations blindly.

## Validation

Earlier source validation (before the approved billing, operations-backfill,
and email-delivery hardening edits) completed:

- `npm run lint` — passed (`tsc --noEmit`).
- `npm run build` — passed (TypeScript project build and Vite production build). Vite reported the existing large-chunk warning for the main bundle and ExcelJS; it did not fail the build.
- `git diff --check` — passed.
- No matching platform test files or test script were found.

No remote writes were used for validation.

Latest local validation after the approved-decision changes:

- `npm run lint` — passed (`tsc --noEmit`).
- `npm run build` — passed; Vite emitted the existing large-chunk warning for
  the main bundle and ExcelJS but completed successfully.
- `git diff --check` and `git diff --cached --check` — passed.
- Deno, `psql`, and the Supabase CLI are unavailable, so focused Edge Function
  tests and SQL execution were not run. The SQL remains unexecuted and
  deployment readiness still requires an explicitly confirmed staging target.
- No database writes, migration or function deployments, commits, pushes, or
  merge finalization were performed.

## 2026-10-19 reassessment

The linked project was re-confirmed through the authenticated Supabase
management project list and the shared browser's Supabase origin:
`fxdnkdyqdwxtgtbylxcr`. The management-plane Edge Function list currently
includes `approve-school-application`, `start-fee-payment`,
`settle-fee-payment`, and `send-invitation`; it does not include
`manage-school-application`.
The local `supabase/config.toml` project label is `NOM-CLOUD`, not the remote
reference; no CLI link/configuration change was made.

All 22 `/platform` navigation destinations rendered in the authenticated
browser. This was a route/render sweep, not a test of every write-capable
button. No approval, school status, contact handling, case, incident, account,
export, preference, database, or deployment write was performed.

### Confirmed current runtime failures

- The earlier confirmed HTTP 400 on Operators was a `GET
  /rest/v1/platform_admins` selecting
  `id,user_id,granted_at,revoked_at,team,profiles!platform_admins_user_id_fkey(full_name,email)`
  and ordering by `granted_at.desc`. Its safe error was
  `column platform_admins.team does not exist`. The frontend query now omits
  `team`; the current Operators route renders without that column error and
  exposes team metadata as unavailable. This resolves that specific 400, not
  the unverified remainder of the originally reported 11 failures.
- Operations Queue and the incident context on System Health both attempt to
  read the `platform_cases` relation through
  `fetchPlatformCases()` / `fetchPlatformCaseWorkload()` in
  `src/services/platformOperationsService.ts`. The relation is defined in the
  local `20261011000002_platform_operations.sql`, but is absent from the live
  catalog. The Operations Queue issues `GET /rest/v1/platform_cases` with the
  `select` list from `caseColumns` and `order=updated_at.desc`; Resource Timing
  captured status 404. The System Health UI shows the same missing-table
  message while loading incident case context. This is a live schema
  availability failure, not an empty result.
- Operations Queue previously rendered `[object Object]` because its catch
  blocks used `String(cause)` on the plain error object returned by
  `supabase-js`. The same unsafe conversion was used in incident workflow
  errors. These paths now call the existing `errorMessage` utility. Browser
  verification confirms the Operations Queue shows the actual table/schema
  error instead of `[object Object]`. The database failure remains unresolved.
- The raw response body and a separate System Health response status were not
  captured. The safe error shown in the UI is `Could not find the table
  'public.platform_cases' in the schema cache`; do not infer a different body
  from this UI string.
- Earlier browser history includes canceled `HEAD` requests for school
  application/student/teacher counts. `net::ERR_ABORTED` is not an HTTP
  response and does not establish another 400. The reported set of 11 HTTP
  400s is still not individually evidenced; do not claim all 11 are fixed.

The duplicate local migration version is resolved by the worktree rename to
`20261011000002_platform_operations.sql`; the existing
`20261011000001_subscription_billing_access.sql` retains its version. The
remote catalog still does not contain the operations tables. Direct CLI
Postgres catalog access remains blocked by SQLSTATE `28P01`, but the
authenticated Dashboard SQL Editor successfully supplied the read-only schema,
RLS, function, constraint, and migration evidence recorded above. No live
migration or data change was made.

Fresh validation after the queue error-state and migration-version corrections:
`npm run lint` and `npm run build` passed; Vite retained its existing
large-chunk warning. Staged and unstaged `git diff --check` passed. No test
script or platform-specific test suite is configured, and Deno is not
installed for the existing Edge Function tests.

The related deployment/architecture checklist is in
[operator-workspace-completion-plan.md](./operator-workspace-completion-plan.md).
