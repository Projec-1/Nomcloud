# School application workflow backend

The UI workflow status values are `pending`, `awaiting_information`, `approved`,
`rejected`, and `onboarding`. The existing database `withdrawn` status remains
for compatibility. Approval is separate from review actions:

- `POST /functions/v1/approve-school-application` with
  `{ "application_id": "UUID", "shortcode": "school-shortcode" }`
- Activation resend with
  `{ "application_id": "UUID", "action": "resend" }`

Approval still creates the school and administrator and sends a Supabase Auth
activation link; it does not generate or send a password. The endpoint response
contract is unchanged. Approval accepts both `pending` and
`awaiting_information` applications; the decision remains on this dedicated
function.

## Typed request contract

Call `POST /functions/v1/manage-school-application` with the user's Supabase
Bearer token. The action and its specific fields are at the top level (no
nested `payload`):

```json
{ "action": "change_priority", "application_id": "UUID", "priority": "high" }
{ "action": "assign_reviewer", "application_ids": ["UUID-1", "UUID-2"], "reviewer_id": "REVIEWER-UUID" }
```

Use exactly one of `application_id` or `application_ids`. Batch requests accept
1–100 unique IDs, execute each target independently, and return results in
request order. A per-application failure does not roll back successful targets.
All actions require an authenticated, unrevoked platform administrator.

The exported TypeScript types in
`supabase/functions/_shared/schoolApplicationContract.ts` are the canonical
request/response contract.

| `action` | Top-level fields | Effect |
|---|---|---|
| `assign_reviewer` | `reviewer_id: UUID \| null`, optional `instructions: string` (max 2000 characters) | Assigns an unrevoked platform admin; null clears assignment. Non-empty instructions are persisted as a private internal note on that application's history. |
| `send_template` | `template: "rejection" \| "documents_needed" \| "onboarding_instructions"` | Sends the selected configured template to each target. The approval template is excluded; use the approval function instead. |
| `change_priority` | `priority: "low" \| "normal" \| "high" \| "urgent"` | Updates reviewer-controlled priority. |
| `archive` / `unarchive` | none | Sets or clears `archived_at`, without changing lifecycle status. Each mutation writes its action name to `school_application_events`. |
| `request_information` | `subject`, `body` | Sets `awaiting_information`, saves communication history, and attempts email. |
| `reject` | `reason`, `subject`, `body` | Sets rejected status and reviewer/time/reason, saves communication history, and attempts email. |
| `reopen` | none | Reopens rejected or awaiting-information as pending and clears the rejection reason. |
| `update_document` | `document_id`, `state`, optional `note` | Updates the current document checklist and appends a persistent document-review event. |
| `update_checklist` | `checklist`: a nonempty subset of `{ required_fields_complete?: boolean, contact_valid?: boolean, school_identity_verified?: boolean }` | Persists reviewer checklist toggles on the application detail row. |
| `add_note` | `body`, optional `mentions: UUID[]` | Adds a private reviewer note; mentions must be unrevoked platform admins. |
| `send_email` | `subject`, `body` | Sends a general message without changing lifecycle status. |
| `set_due_date` | `due_at: ISO-8601 timestamp \| null` | Sets or clears the review due date. |
| `set_review_flags` | `flags: { duplicate_suspected?: boolean, contact_mismatch_suspected?: boolean }` | Reviewer signals only; never auto-rejects. |
| `start_onboarding` | none | Moves an approved application with a created school to onboarding. |
| `update_onboarding` | `checklist: object` | Updates reviewer-maintained onboarding progress after approval. |

Document states are `pending`, `verified`, `missing`,
`replacement_requested`, and `rejected`. Document IDs and task vocabulary are
not inferred by the backend. The application statuses above are the UI-facing
status set.

## Typed response contract

Every valid request returns HTTP 200 with a per-target result envelope:

```json
{
  "results": [
    {
      "application_id": "UUID",
      "action": "send_email",
      "ok": true,
      "status": "pending",
      "updated_at": "2026-10-14T09:00:00Z",
      "communication_id": "UUID",
      "action_persisted": true,
      "delivery": { "state": "sent", "provider_message_id": "provider-id" }
    }
  ],
  "total": 1,
  "succeeded": 1,
  "failed": 0
}
```

Non-email success returns `ok: true`, status and `updated_at`. A per-target
action failure returns `ok: false`, `error` and `error_code`. Email actions
(`send_template`, `request_information`, `reject`, `send_email`) additionally
return `communication_id`, `action_persisted`, and a delivery result:

- `sent`: provider accepted the email; this is not mailbox-delivery
  confirmation.
- `failed`: provider did not accept it; `error_code` states why.
- `queued`: delivery-state finalization failed, so the persisted row may still
  be queued. Never display it as sent.

Failed delivery does not roll back the corresponding workflow action or stop
other batch targets. `succeeded` counts complete actions, including successful
email provider acceptance and persisted sent state. Authentication, invalid
envelopes, and server setup errors use non-2xx responses.

Configure `RESEND_API_KEY` and `SCHOOL_APPLICATION_EMAIL_FROM` as Supabase
Function secrets. Missing settings yield an explicit failed delivery result;
they do not claim success. Do not log applicant addresses, application content,
or provider payloads/responses.

## Direct UI reads

Platform admins can read application list/detail rows directly with
`school_applications.select('*')` under its RLS policy. This includes submitted
fields and `assigned_reviewer`, `priority`, `review_due_at`, `archived_at`,
`document_checklist`, `review_checklist`, `review_flags`, and
`onboarding_checklist`. The required review-checklist booleans are
`required_fields_complete`, `contact_valid`, and `school_identity_verified`.

Related private detail/history is available by separate SELECTs, each filtered
by `application_id` and protected by platform-admin RLS:

- `school_application_notes`: note body, author, mentions, timestamp.
- `school_application_document_events`: document state, note, reviewer,
  timestamp; each update is retained.
- `school_application_communications`: email subject/body and delivery state
  (`queued`, `sent`, `failed`).
- `school_application_events`: status/action audit history without applicant
  message content.

Direct authenticated mutations are revoked from these records; use the
`manage-school-application` function. Profile identity joins remain subject to
the existing `profiles` RLS.
