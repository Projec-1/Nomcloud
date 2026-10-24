# Nom Cloud — Payment Integration Plan (WaafiPay)

**Status:** Database and Edge Functions prepared 2026-09-15. The parent/admin
checkout and receipt views are now connected to the demo-safe payment flow.
Migration `20261023000001_guardian_payment_receipt_details` adds safe verified
receipt metadata, guards manual entries from reusing gateway references, and
provides private optional evidence files. Migrations
`20260915000001_fee_payments_school_id_id_unique` and
`20260915000002_payment_events` are applied. The Edge Function and the parent
payment UI do not enable live payments: the WaafiPay HTTP adapter remains
unimplemented and must be completed and sandbox-tested before live mode.
**Reads:** `SCHEMA_DESIGN.md` §11 (payment events, deferred) and §29 (`fee_payments`);
migration `20260912000006_finance_rls`; corrective
`20260914000001_restrict_fee_record_amount_paid_insert` (§H.13 of the Phase 8 plan).

**What stays closed.** `fee_records.amount_paid` is written only by the
`sync_fee_record_amount_paid` trigger. Neither INSERT nor UPDATE grants it to a
client. An incoming WaafiPay payment changes a balance the same way a cash payment
does: by inserting one `fee_payments` row. Nothing below touches `amount_paid`,
the trigger, or the finance policies.

---

## Decisions locked 2026-09-15

1. **One shared WaafiPay merchant account** for the whole platform. One set of
   credentials, held as Edge Function secrets. No per-school credential storage.
2. **The parent fee checkout is rebuilt** around the existing start/settle
   functions. It supports partial payments, reports pending/failed/cancelled
   results without presenting them as paid, and only creates a receipt after a
   verified applied event. The current UI exposes the simulation only for the
   demo school.
3. **Owner, director and administrator may read `payment_events`**, raw payloads
   and any contact details in them included, within their own school.
4. **Four payment methods from the start** in one `payment_method` column:
   `mobile_money`, `card`, `ussd`, `bank_agent`.

The sections below record the design as built. Where it differs from the first
draft of this plan, the built version is what is described, and §2 explains the
one material change.

## 1. The table: `payment_events` (as built)

One row per message WaafiPay sends us. It is the audit trail of what the provider
said, kept separate from `fee_payments`, which records what the school accepted.

| Column | Type | Why it is needed |
|---|---|---|
| `id` | uuid PK | Row identity. |
| `school_id` | uuid NOT NULL | Tenant key. School-owned, like `fee_payments`. |
| `provider` | text NOT NULL, CHECK `waafipay` | Room for a second provider without a redesign. |
| `provider_event_id` | text NOT NULL, not blank | WaafiPay's own transaction id. |
| `payment_method` | text NOT NULL, CHECK `mobile_money` / `card` / `ussd` / `bank_agent` | Decision 4. The Edge Function maps WaafiPay's payment type codes onto this. |
| `event_type` | text NOT NULL, CHECK `pending` / `approved` / `declined` / `cancelled` | What WaafiPay said. Immutable; part of the idempotency key. |
| `amount` | numeric(12,2) NOT NULL, > 0 | What WaafiPay says was paid. |
| `currency` | char(3) NOT NULL DEFAULT `USD` | Checked against the fee's currency before applying. |
| `fee_record_id` | uuid NOT NULL | Which invoice the payer was paying. |
| `fee_payment_id` | uuid NULL | The `fee_payments` row this event created. NULL until applied. |
| `raw_payload` | jsonb NOT NULL | The message exactly as received. |
| `received_at` | timestamptz NOT NULL DEFAULT now() | When it arrived. |
| `processing_status` | text NOT NULL DEFAULT `received`, CHECK `received` / `applied` / `rejected` / `ignored` | What we did with it. Changes once. |
| `processed_at` | timestamptz NULL | Set exactly when the row leaves `received`. |
| `created_at`, `updated_at` | timestamptz | Standard; `set_updated_at` trigger. |

Both finance references are composite and same-school, `ON DELETE RESTRICT`,
mirroring `fee_payments` to `fee_records`. The prerequisite
`UNIQUE (school_id, id)` on `fee_payments` is in place.

**State integrity is enforced in the table, not left to the function.** A
`fee_payment_id` exists if and only if the row is `applied`. Only an `approved`
event may carry one. A partial unique index allows at most one event per payment
row.

**One consequence.** A `fee_payments` row created from a WaafiPay event cannot be
deleted while its event references it. That is deliberate: money that really
moved is reversed by a refund, not a delete. The refund or void workflow is still
open, as it already was for manual payments.

**Applying an event.** One database transaction, run by the Edge Function:
insert the event with `ON CONFLICT DO NOTHING`. Only for a newly inserted
`approved` event: insert the `fee_payments` row with
`external_ref = provider_event_id`, then set the event to `applied` with its
`fee_payment_id` and `processed_at`. Any other new event is set to `ignored`. The
trigger recalculates the balance. An overpayment is refused by the existing
`amount_paid <= amount` CHECK (23514); the event is then marked `rejected` and no
payment row is left behind.

## 2. Duplicate protection

**The constraint, as built:**

```sql
UNIQUE (provider, provider_event_id, event_type)   -- on payment_events
```

**Why it is wider than the first draft.** The draft keyed on
`(provider, provider_event_id)`. If WaafiPay sends more than one message for the
same transaction id, say `pending` and then `approved`, the approval would have
collided with the pending row and been discarded by `ON CONFLICT DO NOTHING`. A
real payment would never have been recorded, with no error anywhere. No WaafiPay
account exists yet to check their callback behaviour, so the key now includes
`event_type`. A pending and an approved message are different rows. If WaafiPay
turns out to send only one message per transaction, the extra column costs
nothing.

**It still stops a true duplicate.** The exact same message delivered twice has
the same provider, transaction id and event type, so the second insert is
refused. Probed: a repeated `pending` and a repeated `approved` were both refused
with 23505, and the `ON CONFLICT DO NOTHING` form inserted 0 rows.

**Why `event_type` holds only WaafiPay's words.** A column inside a unique key
must never change after insert. `applied` and `rejected` are things we do, and
they change once per row, so they live in a separate `processing_status`. Keeping
them apart means updating our progress can never alter the idempotency key.

**Money can still only be applied once per transaction.** At most one `approved`
row can exist per transaction id, only `approved` rows may link a payment, and a
payment row can be linked by only one event.

**Backstop, still recommended and not yet built:** a partial unique index on
`fee_payments (school_id, external_ref) WHERE external_ref IS NOT NULL`. It would
stop a duplicate payment row even if a future code path skipped `payment_events`.

**Still to confirm against WaafiPay's documentation** once an account exists: the
real names of their statuses and payment type codes. Both vocabularies are CHECK
constraints, so extending them is a small additive migration.

## 3. Where the secret lives

**Confirmed: a Supabase Edge Function secret.** Set with `supabase secrets set`
and read inside the function with `Deno.env.get(...)`. This is the existing
pattern: `approve-school-application` reads `SUPABASE_SERVICE_ROLE_KEY` the same
way, server-side only.

- **Never in the frontend.** Any variable prefixed `VITE_` is bundled into the
  browser. The project `.env` holds only the two public `VITE_SUPABASE_*` values
  and must stay that way.
- **Never in `.env`.** Not committed, not in `.env.example`.
- The same function that holds the key also receives WaafiPay's callback, verifies
  it, and is the only code that writes `payment_events`. **Built:** no client role
  can write the table. Write grants are revoked from `anon` and `authenticated`,
  TRUNCATE included, and there is no INSERT, UPDATE or DELETE policy. Probed: an
  administrator's INSERT, UPDATE, DELETE and TRUNCATE all fail with 42501.

The function runs with the service role, which bypasses grants and RLS. The
`amount_paid` guard therefore does not protect this path by itself. The function
must insert `fee_payments` rows only and never write `fee_records.amount_paid`.

---

## Decisions for you

The remaining live-payment handoff requires WaafiPay merchant approval for
school fee collection, credentials in Supabase Edge Function secrets, and
documented/sandbox-tested provider requests and responses. No live method is
shown or claimed until that work is complete. School fee payments remain
separate from Nom Cloud subscription billing; this flow uses only
`fee_records`, `fee_payments`, and `payment_events`.
