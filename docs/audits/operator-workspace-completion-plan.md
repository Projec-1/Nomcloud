# Operator Workspace completion plan and database architecture

Updated: 2026-10-19

This is the current implementation and deployment checklist for the
authenticated platform-admin workspace. It is evidence-based: local migration
files do not prove that their objects exist in the linked live project.

## Current evidence and safety boundary

- The authenticated browser and the read-only Supabase management project list
  both identify project `fxdnkdyqdwxtgtbylxcr`.
- The local `supabase/config.toml` uses the project label `NOM-CLOUD`, not the
  remote project reference. No local link/configuration change was made.
- All 22 navigation destinations under `/platform` rendered in the shared
  authenticated browser. This verifies route access and rendering, not every
  data query or write action.
- The workspace's shared platform-record indicator reported connected. Real
  school and contact records were present in the UI; sensitive record values
  are intentionally not reproduced here.
- Operations Queue and System Health both fail to load the live
  `public.platform_cases` relation. The UI reports that the relation is not in
  the PostgREST schema cache, and the Dashboard catalog query confirms that
  `platform_cases`, its event table, and the platform incident tables are
  absent. Browser Resource Timing captured the Operations Queue GET as HTTP
  404; the raw response body was not captured. The page surfaces the safe
  message that `public.platform_cases` is missing from the schema cache.
- Operations Queue previously displayed `[object Object]`. Its error handlers
  now use the shared `errorMessage` utility; the browser confirms that the
  actual schema-cache message is displayed instead. This fixes error
  reporting, not the missing live relation. A follow-up UI correction now
  shows unavailable summary values and suppresses the empty-state message when
  the queue read fails.
- The current management-plane Edge Function list includes
  `approve-school-application`, `start-fee-payment`, `settle-fee-payment`, and
  `send-invitation`; it does not include `manage-school-application`.
- Read-only Dashboard SQL now verifies live columns, constraints, RLS policy
  predicates, and function definitions for the operations dependencies.
  `is_platform_admin()` is a `SECURITY DEFINER` function with an empty search
  path and checks for a non-revoked platform-admin grant. The existing base
  platform-admin policies use it; no operations-table policies exist because
  those relations are absent.
- The remote ledger row `20260927191153` is named
  `teacher_date_of_birth_and_gender`. Its stored SQL statement is 920
  characters, has no stored rollback, and its hash matches the local
  `20260927000001_teacher_date_of_birth_and_gender.sql` body after removing
  full-line comments. Read-only checks confirmed that it alters `teachers`,
  includes `date_of_birth` and `teachers_gender_check`, and the live columns
  and constraint match. The migration's logical identity is therefore
  confirmed; its remote version differs from the tracked local filename. No
  migration repair or SQL replay was performed.
- The worktree replacement uses
  `20261011000002_platform_operations.sql`, but the unfinished merge's
  `origin/main` tree still contains `20261011000001_platform_operations.sql`
  alongside `20261011000001_subscription_billing_access.sql`. The version
  collision is not resolved for the final branch until the merge preserves the
  replacement and removes the old operations filename. The merge was not
  finalized.
- The current approved billing decisions are implemented locally in
  `20261011000001_subscription_billing_access.sql`: active owners/directors
  only; no administrator subscription access; no public plan policy; anonymous
  table access revoked; authenticated reads retain the existing
  platform-admin-only RLS policy. The migration has not been applied.
- A local-only follow-up migration,
  `20261019000001_operator_workspace_table_privileges.sql`, is prepared to
  remove broad table and column grants from `anon` and `authenticated` on
  subscription plans, school subscriptions, platform-admin grants, and school
  applications. It restores only authenticated SELECT, anonymous INSERT on
  the public application's submitted columns, and authenticated UPDATE of
  `platform_admins.team`. It does not change RLS, direct `service_role` grants,
  or project-wide default privileges. It fails closed before revoking anything
  if a target has a direct `PUBLIC` ACL, since that could be a source of
  service-role access. The project defaults affect every future public table
  and need a separate, whole-schema impact review.
- The Supabase organization dashboard shows one project, the already-linked
  project `fxdnkdyqdwxtgtbylxcr`; no separate staging project is listed. Treat
  the linked project as production and do not run write tests there.
- The latest owner-provided read-only Supabase catalog report confirms that
  production still lacks the five Operations/System Health relations described
  above. It also confirms broad table privileges, including `TRUNCATE`, on
  `subscription_plans`, `school_subscriptions`, `platform_admins`, and
  `school_applications`; RLS does not constrain `TRUNCATE`. The local
  `20261019000001_operator_workspace_table_privileges.sql` proposal addresses
  the reviewed browser-role grants but has not been applied. It deliberately
  leaves service-role grants and project-wide default privileges unchanged.
- The billing helper currently requires an active `owner`/`director`
  membership, but the catalog report does not establish whether the school
  itself must also be active. Do not add that condition until the product
  authorization rule is confirmed. The report also confirms that approval
  creates the school and memberships but not a subscription; whether approval
  should provision a subscription or trial remains a separate product
  decision. No such behavior is implied or added by these local migrations.
- The live `application_status` enum currently contains `pending`, `approved`,
  `rejected`, and `withdrawn`; the local workflow adds
  `awaiting_information` and `onboarding`. The remote ledger has no rows for
  the local billing, operations, or three application-workflow migration
  versions.
- The operations migration no longer backfills existing contact messages.
  New contact messages can still be synchronized by the live insert/status
  trigger after deployment. A separate, manual-only backfill script is
  prepared at `docs/audits/sql/platform-operations-contact-backfill-opt-in.sql`;
  do not run it without explicit data/retention approval. Case updates driven
  from contact status preserve an existing resolution summary.
- A full static review also confirmed the case/contact status safeguard and
  missing-incident responder validation. No database-side execution test was
  available.
- Applicant review communications (request-information, rejection, and
  templates) are locally disabled in the authenticated UI, Edge Function, and
  workflow RPC. The delivery recorder is service-role only and distinguishes
  queued, provider-accepted, delivered, failed, and unknown; delivered requires
  a provider event ID. No provider webhook signature verifier is configured,
  so these communications remain disabled.
- The separate existing approval/resend activation-invitation path remains
  server-side in `approve-school-application`; its `activation_email_sent`
  result means Supabase Auth accepted the invite/recovery request, not that
  inbox delivery was confirmed. The UI now states that distinction. This
  existing function was not changed or redeployed.
- No live database writes, migration deployments, Edge Function deployments,
  application approvals, school-status changes, or other operational writes
  were performed for this phase.

## Migration review and gated deployment sequence

### Operations migration review

`20261011000002_platform_operations.sql` was reviewed end-to-end. Its concrete
dependencies are present in the linked project: `platform_admins`,
`schools`, `contact_messages`, `profiles`, `audit_logs`,
`public.is_platform_admin()`, `public.set_updated_at()`, and
`extensions.citext`. The live audit-log columns support the trigger inserts;
`actor_role` has no restrictive check constraint.

- Five new relations (cases, case events, incidents, responders, and incident
  updates) receive RLS policies requiring `public.is_platform_admin()`.
  Anonymous access is revoked; authenticated grants are limited to the
  operations needed by the UI. Cases/incidents allow updates but no direct
  delete; case events and incident updates allow only select/insert. Responder
  assignments allow select/insert/delete and have a separate audit trigger.
  The only `platform_admins` update grant introduced is column-level `team`.
- Trigger/helper functions pin `search_path` to the empty string and revoke
  direct execution from client roles. Audit and synchronization triggers use
  `SECURITY DEFINER`; the responder replacement RPC remains
  `SECURITY INVOKER`, explicitly checks platform-admin authority, validates
  active operator IDs, and is executable only by authenticated users.
- Historical contact-message bodies are excluded from the initial operations
  migration. The separate opt-in script maps status and case details only
  when an operator explicitly runs it; its unique source-message key and
  `NOT EXISTS` event seed make that data step retry-safe. The full schema
  migration remains non-idempotent and must never be rerun after partial
  application without inspecting transaction/ledger state and following an
  approved recovery procedure.
- The review corrected two edge cases in the local migration: case status
  transitions no longer replace arbitrary non-`handled` contact-message
  status text with `new`, and `set_platform_incident_responders` raises
  `Incident not found` rather than returning success for an unknown incident
  with no responders.
- The upstream operations migration at version `20261011000001` has the same
  base schema but older audit behavior. The prepared local migration retains
  its unique version and includes system/intake attribution and responder
  metadata. Keep the reviewed local copy as the sole operations migration
  after the Git merge is eventually resolved.

### Ordered proposal — not executed

This sequence is for a disposable/staging project first. It is not
authorization to alter live Supabase.

1. **Reconcile release history before `db push`.** Confirm the exact migration
   tree contains one file per version. The remote teacher migration is already
   applied under `20260927191153`; do not execute its SQL again. The local
   tracked version is `20260927000001`. Get approval for a history
   reconciliation approach after checking all target environments. A
   `migration repair` would write the live migration ledger, so none was run.
2. **Apply the locally revised billing migration
   `20261011000001_subscription_billing_access.sql` only after history
   reconciliation.** It preserves active owner/director subscription reads,
   removes the proposed public plan policy, revokes anonymous plan access,
   and preserves authenticated platform-admin reads under the existing RLS
   policy. The migration remains unapplied. It still sorts before Operations,
   so ordered migration runs include it.
3. **Apply `20261011000002_platform_operations.sql` after the history and
   billing gates.** On staging, validate table/column/constraint creation,
   RLS as anonymous, non-admin, active admin, and revoked admin, and verify
   case completion, responder validation, audit events, and contact-message
   synchronization. The initial migration does not backfill historical
   contact messages; verify existing-message counts are unchanged. The
   separate manual opt-in script requires explicit approval before any use.
   The migration does not depend on billing, but ordered deployment places
   billing first.
4. **Apply `20261014000001_school_application_statuses.sql` as its own
   migration.** Verify that `awaiting_information` and `onboarding` are
   committed before a later migration/function uses them; the live enum
   currently has only the four existing values listed above.
5. **Apply `20261014000002_school_application_workflow.sql`.** It depends on
   the existing `school_applications` table, its
   `school_applications_anon_insert` policy, the enum additions, profile and
   platform-admin relations, and `public.is_platform_admin()`. Verify applicant
   inserts remain pinned to safe defaults, only platform admins can read
   private workflow rows, direct client mutations remain revoked, and the
   authenticated RPC rejects non-admin/revoked callers.
6. **Apply `20261014000003_approve_school_application_awaiting_information.sql`
   after steps 4-5.** It replaces the existing
   `approve_school_application(uuid, uuid, text)` body to permit approval
   from `awaiting_information`. Verify the deployed
   `approve-school-application` Edge Function still invokes this exact
   signature and test both allowed statuses in staging.
7. **Apply `20261019000001_operator_workspace_table_privileges.sql` after
   the operations and application workflow migrations.** It removes table-
   and column-level grants from `anon` and `authenticated` on the four reviewed
   relations, then restores only the browser operations found in source:
   authenticated reads, anonymous INSERT of the public form's actual submitted
   columns, and authenticated UPDATE of the platform-admin `team` column. It
   fails before revoking anything if a target has a direct `PUBLIC` table or
   column ACL, preserving service-role access for further review. Direct
   `service_role` grants, RLS policies, and project-wide default privileges are
   unchanged. In staging, verify table and column privileges,
   anon application submission (including rejected attempts to set decision
   fields), owner/director and platform-admin billing reads, non-admin denial,
   platform-admin team editing, and the approval/workflow RPC paths.
8. **Keep applicant review communications disabled.** The local workflow RPC
   rejects request/reject/send actions until a provider integration and signed
   webhook verification path are implemented. Its delivery recorder is
   executable only by `service_role`; provider acceptance is not described as
   delivery, and delivered status requires a provider event ID. The helper
   classifies a provider 2xx as accepted, explicit 4xx rejection as failed,
   and network, 5xx, or uncorrelatable responses as unknown. The Edge Function
   is not deployed. Do not configure credentials or enable these communications
   until webhook signature verification, retry/idempotency, provider event
   mapping, and server-only execution are tested. The existing approval
   activation-invitation function remains a separate server-side path and its
   UI reports Auth API acceptance, not inbox delivery.
9. Run the read-only staging preflight at
   `supabase/tests/operator_workspace_staging_preflight.sql`, then perform
   role-based SQL and controlled write/browser tests only against an explicitly
   confirmed isolated staging project. The Dashboard currently shows no
   dedicated staging project. Do not run write tests against the linked
   production project. Promote only after separate production approval,
   verified backup/restore, and a rollback/forward-fix plan.

### Decisions requiring approval

- Reconcile local teacher version `20260927000001` with the already-applied
  identical remote statement at `20260927191153`; no ledger repair is approved
  or performed.
- Approve whether to create/configure a dedicated staging project; the
  organization currently lists only the linked project.
- Do not run the optional contact-message backfill without a separate explicit
  data-scope and retention approval.
- Approve production migration/Edge Function deployment separately after
  staging passes. Email remains disabled until provider/webhook security
  requirements are implemented and reviewed.
- Resolve the in-progress Git merge without retaining duplicate migration
  version `20261011000001`. No merge completion or push is requested/performed.

### Final deployment-readiness package (2026-10-19)

**Release status: HOLD.** This package does not authorize staging or production
changes. No live migration, database write, or Edge Function deployment has
been performed.

#### Git and migration-tree gate

- `MERGE_HEAD` is present and matches the current local `origin/main` reference
  (`79ca127`); the merge base is `3a91f90`. `HEAD` is one commit ahead and
  three commits behind `origin/main`. There are no unmerged index entries, but
  the merge is not finalized.
- The `origin/main` tree contains both
  `20261011000001_platform_operations.sql` and
  `20261011000001_subscription_billing_access.sql`. The prepared candidate
  keeps billing at `20261011000001` and operations at
  `20261011000002`; the old operations filename is absent from the current
  index/worktree. The final release tree must contain exactly one file for
  each migration version.
- The operations migration currently has Git status `AM`: a staged addition
  exists, and the working copy has further edits. A merge commit from the
  current index would not include those later working-copy edits. If merge
  finalization is approved later, review the complete staged and unstaged
  changes, stage the reviewed migration contents, and verify the version
  collision is resolved before creating a merge commit. The audit directory
  is untracked. Do not commit, push, or finalize the merge as part of this
  deployment-readiness step.
- The current `HEAD` is `cada620` (`Update backend`), while the supplied
  `f29a37b` (`Update backend`) is a sibling commit with the same parent, not
  reachable from `HEAD` or any branch ref. Metadata-only inspection shows
  `f29a37b` added `.aider.chat.history.md`; the current index and `HEAD` tree
  do not track that path, and `.git/info/exclude` ignores it. The protected
  file was not opened or modified. Do not publish or rewrite the sibling
  commit; the merge remains unfinalized.
- The remote teacher migration is recorded as `20260927191153`, while the
  matching local SQL is named `20260927000001`. Before any `db push`, decide
  and document the canonical cross-environment history-reconciliation
  approach after comparing every deployment target. Do not replay the SQL or
  run `migration repair` as a shortcut; repair changes the remote ledger.

#### Exact authorization and data decisions

| Decision | Choice to approve | Security/data consequence |
|---|---|---|
| School-subscription readers | **Approved choice: active owners/directors only.** The local migration now preserves this boundary and does not add administrator access. | No subscription write permission is added. Staging must verify active owner/director reads and deny administrator, inactive-member, and unrelated-user reads. |
| Plan catalogue | **Approved choice: private to platform administrators.** The local migration removes the public policy, revokes `anon` table privileges, and retains authenticated reads under the existing platform-admin RLS policy. | Do not expose public plan rows through this table. If public pricing is later required, design a limited view/column grant in a separate reviewed change. |
| Historical contact backfill | **Approved choice: do not copy historical message contents into cases.** The default operations migration omits the backfill. A separate opt-in SQL script is prepared but is not approved for execution. | New contact messages can still be synchronized after deployment. Running the optional script would duplicate existing names/topics and message bodies and requires separate explicit scope/retention approval. |
| Email delivery-state trust | **Approved choice: do not trust client/admin-submitted delivery claims.** Email actions remain disabled until secure server-side provider verification is implemented. | The local delivery recorder is `service_role` only, distinguishes accepted from delivered, and deduplicates provider event IDs. No webhook signature-verification path exists yet; do not deploy/enable sends or configure provider credentials. |
| Migration history and release target | Reconcile the canonical teacher-version history and explicitly identify an isolated staging target before running any write test. | The remote teacher SQL is already applied under a different version. An unreviewed replay or ledger repair can cause duplicate DDL or hide drift. The organization currently lists no separate staging project. |
| Production release | After staging evidence, separately approve the specific production migrations, function deployments, target project, and release window. | Staging approval is not production approval. Require a verified backup/restore path, named rollback/forward-fix owner, and a reviewed migration list before any production action. |
| Git merge | Separately approve eventual merge finalization after reviewing the complete index and worktree diff. | Finalizing now would create a merge commit and can omit the unstaged operations-migration corrections unless they are staged. This task does neither. |

The first four decisions above are already approved and reflected in the
current local-only changes; they do not authorize migration execution. The
remaining gates are migration-history reconciliation, an explicitly confirmed
staging target, production deployment approval, and Git merge finalization.

#### Staging acceptance tests (execute only after staging approval)

Use an isolated non-production project with sanitized/generated fixtures and a
verified restore point. First confirm project identity and migration ledger,
and compare the intended migration tree to that target. Capture statuses,
safe error codes, and aggregate counts only; do not record tokens, cookies,
applicant/contact contents, or provider secrets.

| Area | Test | Pass condition |
|---|---|---|
| Migration sequence | Apply the reviewed history reconciliation, approved billing migration contents, `20261011000002`, `20261014000001`, `20261014000002`, then `20261014000003` in order. | Each version is applied once; enum values are committed before workflow objects reference them; all expected columns, constraints, indexes, policies, grants, and RPC signatures exist. No duplicate version remains. |
| Billing authorization | Test subscription reads as an active owner, active director, active administrator, inactive member, unrelated authenticated user, and anonymous user; test plan reads as admin, non-admin, and anon. | Only active owners/directors can read school subscriptions. Only an active platform admin can read plans. Anonymous and non-admin plan reads are denied; no administrator subscription expansion or public plan policy exists. |
| Operations access | Exercise anonymous, authenticated non-admin, active platform admin, and revoked platform-admin sessions against all five operations relations. | Anonymous access is denied. Non-admin/revoked sessions cannot read or mutate privileged rows. Active admins can perform only the granted operations. No case/incident delete path is introduced. |
| Operations invariants | Create/update a case; assign an active then revoked/missing operator; attempt resolution without a summary and with pending approval; resolve with a summary, then reopen. | Invalid assignments/completion fail with safe errors; valid changes succeed; `first_response_at`/`resolved_at` are set and cleared at the documented transitions; audit and case-event rows identify the action without copying unnecessary PII. |
| Contact synchronization | Verify the migration leaves pre-existing contact-message and case counts unchanged; insert a generated contact message, then resolve and reopen its linked case. | No historical content is copied by the default migration. A new message synchronizes as designed; resolving marks the source handled; reopening changes only a handled source back to new and preserves other statuses. Do not execute the optional backfill unless separately approved, and never replay the full non-idempotent DDL migration. |
| Incident command | Create/update/resolve an incident; test active and revoked commanders/responders; call responder RPC with valid, invalid, and empty lists, including a nonexistent incident ID. | Only active operators may be assigned; resolution timestamps track status; audit/update records are written; nonexistent incident fails even with an empty list; no write is accepted from non-admin/revoked actors. |
| Application public intake | As anon, submit a valid application and try to set reviewer-owned status/reviewer/priority/checklist fields. As authenticated non-admin, attempt private reads and workflow RPC calls. | Valid intake is pinned to `pending` and safe workflow defaults. Reviewer-controlled fields cannot be forged. Non-admin cannot read private workflow rows or execute privileged actions. |
| Application reviewer workflow | As active admin, test assignment to active/revoked reviewers, supported non-email actions, invalid payload lengths/enums, note mentions, checklist keys/types, due-date parsing, and status-transition guards. Also call disabled email-dependent actions. | Only supported values and transitions succeed; invalid inputs fail explicitly; notes/documents/communications/events are private; each accepted action updates the application and writes the expected event atomically. Email-dependent actions return an explicit disabled error and make no workflow mutation. |
| Approval and onboarding | Verify the deployed approval Edge Function invokes `approve_school_application(uuid, uuid, text)`; test approval from `pending` and `awaiting_information`, forbidden source statuses, then onboarding with/without an approved school link. | Both approved source statuses work; forbidden transitions fail; onboarding requires an approved application and linked school. No production application is used for testing. |
| Activation invitation | In staging with a controlled mailbox or non-delivering Auth test setup, test invite and resend/recovery responses plus a provider error. | Only the server-side Auth API result determines request acceptance; non-admin callers are denied. UI describes acceptance as such and never claims inbox delivery. |
| Email lifecycle | Keep sends disabled. Verify authenticated callers cannot execute the delivery recorder; verify service-role-only execution, accepted-versus-delivered semantics, event-ID deduplication, and immutable final states. Before later enabling sends, test signed provider webhooks, replay, invalid signatures, retries, and provider unavailable/rejected results with a non-delivering adapter. | No caller can fabricate delivered state through an authenticated RPC. Provider HTTP acceptance is shown as accepted, never delivered. Email-dependent workflow actions remain blocked and do not mutate applications. Do not enable actual sending until webhook signature verification and provider delivery behavior pass review. |
| UI and logs | Retest `/platform/operations`, `/platform/health`, and `/platform/applications` with success, empty, permission-denied, backend-error, and retry conditions. | Loading, empty, unavailable, and error states are distinct; stale records are cleared on failed refresh; successful actions wait for server confirmation; no fabricated records or sensitive response payloads appear in logs. |

**Go/no-go:** proceed beyond staging only when all migration/history
preconditions are reconciled, every applicable test passes, the approved
authorization choices are verified, any optional backfill has separate
approval (otherwise it remains unused), the restore path is proven, and
production approval is separately recorded. Any failed test or ambiguous live
schema means stop and prepare a forward correction; do not force a migration
repair or rerun the full migration.

## Status vocabulary

Use these status names consistently:

- **Verified working** - the specified behavior has direct runtime or
  integration evidence; the scope of that evidence must be stated.
- **Fixed and locally tested** - a source change has passed the applicable
  local or browser check; this does not imply that an unavailable live
  dependency is fixed.
- **Prepared locally but needs database migration deployment** - source SQL
  exists locally, but remote deployment has not been verified or performed.
- **Requires Edge Function deployment** - local function code exists, but the
  required function is not deployed to the target project.
- **Requires external integration or credentials** - a provider or
  infrastructure service must be selected and configured outside the browser.
- **Blocked by unresolved schema or authorization evidence** - live schema,
  migration, RLS, or permission facts are insufficient to implement or claim
  success safely.
- **Not implemented and still required** - a product capability is expected
  but no genuine backend path currently exists.
- **Not required, with a reason** - a proposed behavior is deliberately
  excluded because it would be misleading or unsafe.

## Route-by-route checklist

| Route / section | Status | Verified scope and remaining work |
|---|---|---|
| `/platform` - Overview | **Verified working** | Route rendered and the shared platform-record read was connected. Cards and queues are derived from loaded records. Validate each count's scope and test export separately before relying on it operationally. |
| `/platform/actions` - Action Center | **Verified working** | Route rendered; it opens real application, contact-message, and school records. It does not simulate assignment or resolution. |
| `/platform/schools` - Schools | **Verified working** | Real school records rendered. Review filters and profile navigation are source-backed. Suspend/reactivate are real database writes in source but were not submitted in this read-only review; verify RLS and audit coverage before production use. |
| `/platform/people` - People | **Verified working** | Displays the school contact/admin subset from school records, not a complete people directory. Do not advertise it as all students, teachers, parents, or memberships. |
| `/platform/requests` - Requests & Reviews | **Verified working** | Real contact-message queue and filters are present. Mark-handled is a real write in source but was not submitted. Assignment, replies, escalation, and rejection remain unimplemented. |
| `/platform/applications` - School Applications | **Blocked by unresolved schema or authorization evidence** | Read UI rendered. The deployed `approve-school-application` exists, but no write was tested. Rich reviewer workflow depends on local `20261014000001`-`03` migrations and `manage-school-application`; that function is absent from the deployed list. Verify remote schema/RLS and deploy the function only after migration reconciliation. |
| `/platform/communications` - Communications | **Requires external integration or credentials** | Current UI truthfully reports no platform-wide composer, provider, or delivery history. Decide provider, sender identity, consent, delivery tracking, and retention before implementation. School-scoped messaging is separate. |
| `/platform/operations` - Operations Queue | **Prepared locally but needs database migration deployment**; **Blocked by unresolved schema or authorization evidence** | The real case UI uses `platform_cases` and case-event tables from `20261011000002_platform_operations.sql`. Live catalogs confirm the relations and their RLS policies are absent; the GET currently returns 404. Error display is **Fixed and locally tested**. Failed reads now show unavailable KPIs, not zero counts or an empty queue. |
| `/platform/analytics` - Analytics | **Verified working** | Route rendered as a current snapshot derived from loaded platform records. Historical trends, revenue, retention, and usage analytics are not represented. |
| `/platform/activity` - Activity | **Verified working** | Route rendered from audit rows. This is not a comprehensive message, security, delivery, or telemetry event stream. |
| `/platform/audit` - Audit Logs | **Verified working** | Read-only audit view rendered. Confirm live RLS, retention, pagination/limits, and event-writing coverage; school-status changes and other operations need verified audit paths. |
| `/platform/health` - System Health | **Blocked by unresolved schema or authorization evidence**; **Requires external integration or credentials** | Automated health signals are explicitly unavailable. Incident context fails because `platform_cases` is absent; local incident tables are also absent. The UI labels incident command as manual records rather than claiming it is available. Select and configure a monitoring provider before adding telemetry. |
| `/platform/maintenance` - Maintenance | **Not implemented and still required** | No server-enforced maintenance switch or job exists. A browser-only switch is intentionally not offered. Define authorization, scope, schedule, expiry, audit, and emergency override first. |
| `/platform/security` - Security | **Verified working** | Scope is the signed-in operator's MFA/assurance state. Network-wide security events, other users' factors, session history, access reviews, and containment are unavailable. |
| `/platform/permissions` - Permissions | **Verified working** | Shows platform-admin grants and their active/revoked state. A general role matrix and grant/revoke workflow are not implemented. |
| `/platform/operators` - Operators | **Verified working** | Real operator grants and profile joins render. The live `platform_admins.team` column is absent, so the client no longer selects it and team metadata remains unavailable. |
| `/platform/features` - Features | **Not implemented and still required** | No feature-flag registry, rollout, per-school override, or adoption source exists. Do not add toggles until there is a server-enforced flag model. |
| `/platform/integrations` - Integrations | **Requires external integration or credentials** | No integration registry, webhook source, provider-health check, or delivery history is connected. Keep provider credentials server-side. |
| `/platform/billing` - Billing | **Verified working** | The screen derives plan labels from loaded school subscriptions. School-level fee/payment infrastructure is distinct from a platform invoice, payment, and reconciliation ledger; that ledger is **Not implemented and still required** only if platform billing is a product requirement. |
| `/platform/data` - Data | **Not implemented and still required** | No governed export/import job or access/deletion request register exists. Define scope, approval, secure storage, retention, and audit before enabling operations. |
| `/platform/backups` - Backups & Recovery | **Requires external integration or credentials** | No backup-run, restore-test, or recovery-objective source is connected. Select the backup/infrastructure provider and prove restore procedures before reporting backup health. |
| `/platform/settings` - Settings | **Verified working** | Route rendered. Theme/language/notification preferences are device-local; password reset uses Supabase Auth. No platform-wide settings store, config audit, or session-revocation feature is claimed. Individual preference and auth controls were not submitted during this review. |

### Button and form verification boundary

- The browser navigation controls were exercised for every listed route.
- Visible page controls were inventoried and their handlers/data flow were
  source-reviewed. Read-only navigation is verified; write-capable controls
  (approval, status change, mark handled, case/incident edits, responder
  assignment, password reset, and operator changes) were not submitted.
- Exports and local preference changes were not invoked because they can
  download sensitive records or persist browser state.
- No write action should be marked verified until it is tested against a
  non-production environment with the appropriate authorized roles and its
  server response and audit event are checked.
- The platform route guard is client-side navigation protection only.
  Database RLS and server-side authorization must independently enforce access.

## Local database and function inventory

These are source/migration facts, not claims that the objects are deployed:

| Domain | Local source / dependencies | Current disposition |
|---|---|---|
| Tenancy and identity | `20260903000002_platform_core.sql`, `20260904000002_schools.sql`, `20260904000003_identity.sql`, plus later RLS/identity migrations | Core schools, profiles, memberships, and platform-admin grant paths are used by the UI. Confirm exact live columns, joins, policies, and migration versions with the read-only audit queries. |
| Applications | `20260904000004_school_applications.sql`, `20260908000003_school_application_details_and_approval.sql`, `20261014000001_school_application_statuses.sql`, `20261014000002_school_application_workflow.sql`, `20261014000003_approve_school_application_awaiting_information.sql` | Approval function is deployed. Rich workflow migrations are local; management Edge Function is not deployed. |
| Operations and incidents | `20261011000002_platform_operations.sql`; depends on existing platform admins, schools, profiles, contact messages, audit, `is_platform_admin()`, and `set_updated_at()` | Defines cases, event history, incidents, responders, RLS policies, validation triggers, and audit paths. Dashboard catalog checks verified the dependencies and confirmed the new relations/policies are absent. A unique local version is prepared; database deployment remains pending authorization review and explicit approval. |
| Audit and communications | `20260904000012_communication_and_audit.sql`, `20260905000001_revoke_audit_log_mutation.sql`, `20260905000002_revoke_audit_log_truncate.sql`, later RLS migrations | Audit rows and school-scoped communications are used. Verify every privileged write's audit path and actual live policies. |
| School finance and subscriptions | `20260904000010_finance.sql`, payment-event migrations, `20261011000001_subscription_billing_access.sql` | Genuine school-level finance/subscriptions exist. The local billing migration preserves active owner/director subscription reads and platform-admin-only plan reads; it has not been applied. Verify those role boundaries in staging before release. |
| Security, health, integrations, backups, maintenance, flags, data governance | No connected platform-wide source for these capabilities was verified | Do not invent tables or records. Specify the data owner/provider, access boundary, retention, and event contract before creating schema. |

The current deployed Edge Function inventory is read-only management metadata.
It proves function names are deployed, not that each function's behavior,
authorization, secrets, or database dependencies are correct. Function source
and remote deployment must be reviewed separately.

## Validation and browser coverage

- Latest local validation: `npm run test:operator-workspace` passed 38 tests,
  `npm run lint` passed, `npm run build` passed, and `git diff --check` passed.
  Vite emitted the existing warning that the main JavaScript and ExcelJS
  chunks exceed 500 kB; the build completed successfully.
- The test suite applies the six reviewed migrations to a fresh, in-memory
  PGlite 0.5.10 database (PostgreSQL 18.6) with a minimal explicit prerequisite
  schema fixture. Role-based tests cover owner/director billing reads,
  platform-admin-only plans and operations, anonymous application submission,
  workflow authorization, service-role delivery recording, case/incident
  history, and contact-message privacy. This is useful SQL/RLS evidence, but it
  is not a clone of the production schema, Supabase Auth, or PostgREST.
- That isolated run found and fixed a mismatched dollar-quote terminator in
  `20261019000001_operator_workspace_table_privileges.sql`. No production SQL,
  deployed function, or email-provider call was made.
- The browser suite visits all 22 workspace routes and exercises selected
  writes and failure paths with all Supabase and external requests intercepted.
  Those browser checks do not prove live database behavior.
- Deno, `psql`, and Docker are unavailable, so Edge Function runtime tests and
  Supabase-local integration tests remain unrun. No separate staging target is
  currently available. The repository-local Supabase CLI can inspect and
  prepare deployment commands, but was not used to change the remote project.
- All 22 workspace routes were visited. Operations Queue and System Health
  were retested; both continue to show the missing `platform_cases` schema
  error. Resource Timing captured the Operations Queue
  `GET /rest/v1/platform_cases?...&order=updated_at.desc` as HTTP 404. The raw
  response body was not captured. The queue displays unavailable KPIs and
  suppresses the empty-result message while the read fails.
- The original reported set of 11 HTTP 400s was not individually reproduced;
  this verified `platform_cases` request is a 404, not evidence that all 11
  reports are resolved.
- The package now defines `test:operator-workspace`; Deno-specific Edge
  Function tests still cannot run because Deno is not installed.

## Database architecture and migration roadmap

Use this order for future database work. Do not skip schema discovery or
security design to make a screen load.

### 1. Establish the target and reconcile history

- Verify the Dashboard project reference before every remote inspection.
- Run the read-only table/column, constraint/index, enum, RLS, function, and
  migration-history queries in the [data audit](./operator-workspace-data-audit.md).
- Compare each result with the complete ordered local migration list.
- Resolve the duplicate `20261011000001` and remote/local migration divergence
  only after confirming the remote applied state. Never change an already
  applied migration or use migration repair to make lists appear aligned.
- Do not place credentials in source, shell history, screenshots, or chat.

### 2. Define ownership and data boundaries

For every domain, record the system of record, owner, tenant key, data
classification, retention, expected volume, and read/write actors:

- **School tenancy:** `schools` is the tenant root; school data references
  `school_id` and is governed by active memberships and role.
- **Platform access:** `platform_admins` represents platform grants; school
  memberships are not platform grants. Never let a browser client self-grant.
- **Applications:** applicant-submitted data is distinct from private review
  notes, document events, communication delivery, and status history.
- **Operations:** cases and manual incidents contain operator workflow only;
  they are not monitoring telemetry and must not copy student PII.
- **Audit:** append-only record of defined actions, with an identified writer
  for each sensitive mutation; it is not a substitute for security telemetry.
- **Finance:** school fee records/payments and subscriptions stay distinct
  from platform invoices, payment-provider settlements, and reconciliation.
- **External systems:** monitoring, messaging, backups, and provider health
  belong to explicit integration contracts, not client-side status flags.

### 3. Design a migration as a schema contract

For each new table or change, specify:

1. Primary key and stable identifiers.
2. Foreign keys and deletion behavior.
3. Required fields, allowed states, state-transition rules, and constraints.
4. Uniqueness and idempotency keys for retried requests.
5. Indexes matching real filters, joins, and ordering.
6. Tenant ownership and platform-admin scope.
7. Retention and audit requirements.
8. Compatibility with existing migrations and deployed clients.

Use one unique, ordered migration version per file. Prefer additive, reviewable
changes; do not introduce a second definition of an existing object to bypass
history drift. Backfills must be deterministic, bounded, and safe to rerun.

### 4. Put authorization at the data boundary

- Enable RLS on tenant and privileged tables.
- Write explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies for the
  minimum required roles; scope tenant records through active memberships.
- Treat platform-admin checks as server-side authorization, not a UI condition.
- For privileged transitions, prefer a narrow RPC or Edge Function that
  authenticates the caller, validates input and state transition, performs the
  write atomically, and records the audit event.
- For `SECURITY DEFINER` functions, fix `search_path`, revoke default/public
  execution, grant only the required role, and verify the function owner and
  caller authorization.
- Keep service-role secrets and provider credentials on the server.

### 5. Implement the service and UI against the contract

Keep the layers explicit:

```text
React route and section
  -> typed service in src/services
  -> authenticated PostgREST read or narrow RPC / Edge Function write
  -> PostgreSQL constraints, RLS, triggers, and audit
  -> external provider adapter (server only, where required)
```

The UI must distinguish loading, genuine empty results, backend errors,
unavailable integrations, and successful server-confirmed writes. Clear stale
data after a failed refresh. Never turn an exception into zero, a green status,
or a success toast.

### 6. Test before deployment

- Apply migrations only to an isolated local database or disposable branch
  after the remote/local history has been reconciled.
- Test a clean migration sequence and a repeatable upgrade from the supported
  prior schema.
- Test RLS as anonymous, authenticated non-member, school member, another
  tenant's member, and active/revoked platform admin.
- Test invalid state transitions, missing references, duplicate retries,
  concurrent updates, and audit-event creation.
- Test Edge Function authorization and provider failures without exposing
  secrets.
- Continue adding service contract and route-level tests for loading, empty,
  error, retry, and success states. The new PGlite tests cover a minimal
  prerequisite fixture only; they do not replace a supported-version Supabase
  local stack or isolated staging tests. Deno is not installed, so the
  existing Edge Function Deno tests were not run in this environment.

### 7. Deploy in controlled order

1. Review the remote migration ledger and approve a unique, dependency-correct
   migration sequence.
2. Take/verify the appropriate backup and prove a restore path for the target
   environment.
3. Deploy schema and policies first; verify objects, grants, RLS, and
   constraints with read-only catalog queries and role-based tests.
4. Deploy Edge Functions after their database contracts exist; verify
   authorization, logs, and provider configuration.
5. Enable the corresponding UI path only after backend verification.
6. Run authenticated read-only browser checks, then controlled write tests in
   staging. Capture endpoint, response status, safe error code/message, and
   audit outcome without tokens or personal record contents.
7. Promote to production only with explicit approval and a rollback plan.

Prefer a forward corrective migration over destructive rollback once data has
been written. Never drop user data or rewrite migration history as a shortcut.
Rollback must define the data-preservation strategy, feature disablement, and
restore point before deployment.

## Phase 23 — Platform controls implementation status

Local-only implementation was added in
`supabase/migrations/20261019200000_platform_controls_health_backup_billing.sql`
and connected to the Operator Workspace controls. This is an additional
migration beyond the previously reviewed six-migration release sequence; the
old six-migration dry run does not cover it.

- **Maintenance:** settings are persisted and audited. Shared school-access
  paths and the application workflow enforce the maintenance state while
  retaining platform-operator access and public application submission. This
  is not a global HTTP gateway and does not gate unrelated external services.
- **Feature flags:** platform administrators can persist the four defined
  flags; database policies/triggers and the application-review function
  enforce their associated paths. This does not create a universal flag
  framework for every platform route.
- **Health:** an operator can run an authenticated, on-demand database and
  operations-table probe. Repeated failed probes create monitored incidents;
  successful probes do not silently resolve them. No scheduled probe,
  infrastructure-provider monitoring, or alert delivery is configured.
- **Backups:** an authenticated, read-only Supabase Management API inventory
  check records provider evidence. It does not initiate backups or prove
  restore success. The Edge Function requires a server-side
  `SUPABASE_ACCESS_TOKEN`, which was not available for verification here.
- **Billing:** invoices, payments, and immutable audit events have a
  database-backed ledger and constrained provider evidence. The UI is
  intentionally read-only; no invoice creation process, payment gateway, or
  verified payment-provider integration is connected. No synthetic or
  completed payment records are created.
- **Application communications:** email delivery remains disabled. Provider
  credentials, signed event verification, idempotent delivery tracking, and
  confirmation from a live provider are not available; acceptance must not be
  described as delivery.

The operator-workspace test command passed **50/50** tests locally, including
11 disposable PGlite migration/security tests and mocked browser/provider
contracts. `npm run lint` passed. `npm run build` passed; Vite emitted its
existing large-chunk advisory. These checks do not constitute Edge Function
Deno runtime tests, a supported Supabase local-stack test, provider
verification, staging validation, or production validation.

**Release remains on hold.** Do not deploy this migration until its contents
and ordering have been reviewed against the target migration history, the
exact pending list has been refreshed read-only, and production backup and
restore requirements are satisfied and approved. Do not deploy either new
Edge Function until Deno/runtime checks and server-side secrets are available.

## Phase 24 — Final local validation

The approval Edge Function previously read `platform_feature_flags` directly
with the service-role client, while the controls migration revokes that role's
table access. It now calls the granted `is_platform_feature_enabled(text)`
RPC. Disposable PGlite coverage confirms service role can call the RPC but
cannot read the table directly; a source-contract test guards the Edge
Function call pattern.

The full local suite passed **51/51** tests, including the migration and
authorization checks. `npm run lint` and `npm run build` passed; Vite still
reports the existing large-chunk advisory.

The linked project ref was confirmed as `fxdnkdyqdwxtgtbylxcr`. The fresh
read-only migration list reports exactly seven local versions pending:
`20261011000001`, `20261011000002`, `20261014000001`, `20261014000002`,
`20261014000003`, `20261019000001`, and `20261019200000`; the Teacher version
`20260927191153` matches production. The read-only `db push --dry-run` was
attempted but could not connect: Supabase rejected the CLI temporary database
role password. No migration or production data change occurred. Configure
the correct `SUPABASE_DB_PASSWORD` in the local execution environment without
sharing its value, then rerun the dry run before release approval.
The variable was checked in process, user, and machine scopes without
printing its value; it is not configured in any of them.

The read-only deployed-function inventory shows `approve-school-application`
active at version 8. The local release code set is
`approve-school-application` (update), `manage-school-application` (deploy),
`platform-health-check` (deploy), and `platform-backup-status` (deploy).
The three latter functions were not present in the deployed inventory.
Function deployments remain blocked pending Deno/runtime validation,
migration approval, and required server-side secrets.

## Immediate next actions

1. Obtain the decisions listed above; do not run `supabase db push` while the
   version collision, billing authorization, and contact-message retention
   approvals remain unresolved.
2. Keep the current migration corrections reviewable in the worktree and do
   not finalize the merge or push without explicit approval.
3. After staging approval, execute the numbered sequence in a disposable
   project, verify schema/RLS/trigger behavior, and retest Operations Queue and
   System Health before considering production.
4. Keep email, monitoring, integration, backup, and maintenance capabilities
   unavailable until their providers and data contracts are approved and
   deployed.
