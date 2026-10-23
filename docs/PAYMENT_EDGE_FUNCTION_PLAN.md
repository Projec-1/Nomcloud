# Nom Cloud — Payment Edge Function Plan (WaafiPay)

**Status:** The student-fee flow uses the existing `payment_events` and
`fee_payments` ledgers. A shared WaafiPay adapter now implements the documented
sandbox purchase and preauthorization APIs; the school-subscription checkout is
being added separately in code and migration
`20261023120000_subscription_checkout.sql`. That migration and the new
`subscription-checkout` Edge Function have not been applied or deployed as part
of this work. Sandbox credentials and a merchant transaction have not been
verified. The adapter rejects the production endpoint.
**Reads:** `docs/PAYMENT_INTEGRATION_PLAN.md`; migration
`20260915000002_payment_events`; `supabase/functions/approve-school-application/index.ts`
as the structural pattern.

**Verification boundary.** WaafiPay's API documentation has been reviewed for
the sandbox endpoint and purchase/preauthorization services. No authenticated
sandbox transaction has been run, so merchant-specific response behavior and
settlement remain unverified.

---

## 1. Function shape: two functions, plus one database function

**Recommendation: two Edge Functions.** `approve-school-application` does one job
end to end: verify the caller, check authority, validate input, then make the
atomic database change through an RPC. Payments split naturally into two such
jobs, with different callers and different trust.

| Function | Called by | Does | Writes money? |
|---|---|---|---|
| `start-fee-payment` | Signed-in parent (JWT required) | Verifies the caller may pay this fee, checks the amount against the real balance, calls PreAuthorize, records the provider's answer as a `pending` or `declined` event, returns a transaction reference. | **No** |
| `settle-fee-payment` | The app polling after the parent approves, or a WaafiPay callback if one exists | Asks WaafiPay for the outcome and calls Commit, then records and applies the result. Re-running it is harmless. | **Yes, via the DB function** |

Keeping the money write out of the first function means a start request can never
create a payment, however it is called.

**Settle never trusts the caller.** It takes only a transaction reference. Amount,
status and method come from WaafiPay's own answer, never from the request body.
That is also why it does not depend on a callback existing: polling and a callback
both end in the same "ask the provider, then apply" step.

**The one database function: `apply_payment_event`.** `supabase-js` cannot run
several statements in one transaction, and the integration plan requires one.
Following `approve-school-application`, which does its atomic work through
`approve_school_application`, a Postgres function does it in a single
transaction:

1. Insert the event with `ON CONFLICT (provider, provider_event_id, event_type) DO NOTHING`.
2. If nothing was inserted, stop. It is a duplicate.
3. If the new event is `approved`: insert the `fee_payments` row
   (`external_ref = provider_event_id`), then set the event `applied` with its
   `fee_payment_id`.
4. Otherwise set it `ignored`. If the CHECK refuses an overpayment (23514), set it
   `rejected` and insert no payment.

It is callable by `service_role` only. It needs one small migration when this is
built.

## 2. The mock layer

**One adapter interface, two implementations.** All provider traffic goes through:

```ts
interface PaymentProvider {
  preAuthorize(req: { referenceId: string; amount: number; currency: string;
                      method: PaymentMethod; accountNo: string }): Promise<ProviderResult>
  commit(req: { transactionId: string }): Promise<ProviderResult>
  cancel(req: { transactionId: string }): Promise<ProviderResult>
}

type ProviderResult = {
  transactionId: string
  eventType: 'pending' | 'approved' | 'declined' | 'cancelled'
  amount: number
  currency: string
  method: PaymentMethod
  raw: unknown            // stored verbatim as payment_events.raw_payload
}
```

`MockWaafiPay` and `HttpWaafiPay` both return `ProviderResult`. **Nothing outside
the adapter ever sees a WaafiPay-shaped response.** Everything that matters —
authorisation, the idempotency key, `apply_payment_event`, the trigger — runs
unchanged against the mock.

**Scenarios are chosen by test phone number and need no stored state.** Edge
Functions are stateless, so the mock encodes the scenario in the transaction id it
returns, and Commit reads it back:

| Test account | PreAuthorize returns | Commit returns | Proves |
|---|---|---|---|
| `...0001` | `pending`, id `MOCK-APPROVE-<uuid>` | `approved` | The happy path writes one payment. |
| `...0002` | `declined` (wrong PIN / no funds) | not called | No payment row. |
| `...0003` | `pending`, id `MOCK-TIMEOUT-<uuid>` | `cancelled` | Abandoned approvals leave no money. |
| `...0004` | `pending`, id `MOCK-DUPLICATE-<uuid>` | `approved`, then the same again | A repeated success applies once. |

The mock's `raw` payload imitates WaafiPay's envelope, so the stored JSON looks
realistic. That shape is labelled as assumed.

**Mock money can only ever land in the demo school.** There is one Supabase
project and it holds real schools. A mock that could mark a real family's fee paid
would be the worst possible bug. So when `WAAFIPAY_MODE=mock`, both functions
refuse any fee whose school does not have `schools.is_demo = true`, reusing the
batch 0 marker. In `live` mode the check is skipped.

**Proving it end to end, without an account:**

1. `deno test` on the adapter: each scenario maps to the right `ProviderResult`. No
   network needed.
2. Rolled-back SQL probes on `apply_payment_event`, in the same style as every
   batch: approved creates one payment and moves `amount_paid` through the trigger;
   a duplicate inserts nothing; declined and cancelled create no payment;
   overpayment is `rejected`.
3. A scripted run against the deployed functions in mock mode, on a demo-school
   fee: start with `...0001`, settle, then check one `pending` event, one `applied`
   event, one `fee_payments` row and the new balance. Settle again: nothing changes.
   Repeat for `...0002` to `...0004`.

Step 3 needs a demo guardian account with a demo fee. The demo school currently
has no memberships, which is the open seeding question H.11.

## 3. Sandbox verification and production handoff

The adapter sends requests only to `https://sandbox.waafipay.com/asm` and
supports mobile-wallet payments. Before sandbox use, configure the merchant
credentials as Edge Function secrets (`WAAFIPAY_MERCHANT_UID`,
`WAAFIPAY_API_USER_ID`, `WAAFIPAY_API_KEY`) and set
`WAAFIPAY_BASE_URL` to the sandbox endpoint. Set `WAAFIPAY_MODE=live` only in a
non-production sandbox deployment after the credentials are verified. Then test
approved, declined, pending, and ambiguous outcomes for both billing ledgers.

Production is deliberately blocked in code. Enabling it requires a separate
review of production credentials, endpoint allowlisting, migration, deployment,
and payment operations. Do not point this release candidate at production.

**On the secret precedent.** The only live example today is
`approve-school-application` reading `SUPABASE_SERVICE_ROLE_KEY`. `RESEND_API_KEY`
followed the same pattern in a `transactional-email` function, but that function
was deleted in commit `958bb5b`, leaving an empty folder. WaafiPay would be the
first third-party secret set by hand in this project. The mechanism is the same.

**Nothing else changes.** Not the two function flows, the authorisation checks,
`apply_payment_event`, `payment_events`, its RLS, or the finance tables.

**Three things may change, only if WaafiPay's documentation requires it:**

- **Status or method names differ.** Mapping lives in the adapter. If the names
  fall outside the table's CHECK lists, that is a small additive migration.
- **WaafiPay sends callbacks.** `settle-fee-payment` would then also verify their
  signature before acting.
- **PreAuthorize waits for the PIN** instead of returning straight away. `start`
  would then need a short timeout so it stays inside Edge Function time limits.
  The settle step is unchanged.

## 4. Where `amount_paid` gets touched: never, by this design

- **Neither Edge Function writes `fee_records` at all.** They read the fee to check
  who may pay and what the balance is, nothing more.
- **The only money write is `apply_payment_event`**, and all it does to finance
  tables is insert one `fee_payments` row. The existing
  `fee_payments_sync_amount_paid` trigger recalculates the balance, exactly as for a
  cash payment.
- **Overpayment stays the database's job.** The existing `amount_paid <= amount`
  CHECK refuses it, and the event is marked `rejected`.
- **Migration 13 and H.13 are unchanged.**

**One caveat to state plainly.** These functions run with the service role, and
`apply_payment_event` would be a privileged database function. Both bypass the
column grants that stop clients writing `amount_paid`. The guard is therefore
design and review discipline on this path, not a database lock. Two cheap checks:
a probe asserting `amount_paid` changes only through the trigger, and a build-time
grep failing if `amount_paid` appears in a write inside either function or the
database function.

---

## Decisions locked 2026-09-15

1. **Owner, director and administrator may start a payment on a parent's behalf**,
   for any fee in their school. A guardian may start one only for their own linked
   student's fee.
2. **Partial payments are allowed**, up to the remaining balance. No new constraint
   was needed: `fee_payments_amount_check` (`amount > 0`) and
   `fee_records_amount_paid_not_over_check` (`amount_paid <= amount`) already
   express exactly that.

---

## As built

### Files

| File | Role |
|---|---|
| `supabase/migrations/20260915000003_apply_payment_event.sql` | The transactional database function. |
| `supabase/functions/start-fee-payment/index.ts` | Starts a payment. Cannot record money. |
| `supabase/functions/settle-fee-payment/index.ts` | Settles a payment. The only money path, through `apply_payment_event`. |
| `supabase/functions/_shared/payments/provider.ts` | The adapter interface, types and mode selection. |
| `supabase/functions/_shared/payments/mockWaafiPay.ts` | The mock provider. |
| `supabase/functions/_shared/payments/waafiPayHttp.ts` | Sandbox-only WaafiPay purchase, preauthorization, commit, and cancel adapter. Not verified against merchant access. |
| `supabase/functions/subscription-checkout/index.ts` | Authenticated school-subscription checkout and Enterprise enquiry boundary; not deployed. |
| `supabase/migrations/20261023120000_subscription_checkout.sql` | Subscription invoice/payment ledger operations and activation RPCs; not applied. |
| `src/pages/app/admin/SubscriptionBilling.tsx` | Server-backed school subscription catalog, checkout, and invoice history. |
| `src/pages/app/parent/Fees.tsx` | Parent student-fee checkout through the existing fee-payment functions. |
| `supabase/functions/_shared/payments/access.ts` | Shared caller verification, fee authorization and the mock safety rule. |
| `supabase/functions/_shared/payments/mockWaafiPay.test.ts` | Offline tests, layer (a). Not deployed. |

### Differences from the plan, and why

- **Mode defaults to mock.** `WAAFIPAY_MODE` is not set at all. Live mode needs
  `WAAFIPAY_MODE=live` and all four credentials; if any is missing it fails
  closed rather than falling back to mock.
- **The mock safety rule is enforced twice**: in `access.ts` before the adapter is
  called, and inside `apply_payment_event` through its `p_is_mock` argument. The
  second layer holds even if a future caller skips the first.
- **Settle also checks the caller.** The plan had settle accept only a reference.
  It still takes nothing else, but it now applies the same "may pay this fee"
  check as start, so a stranger cannot settle someone else's transaction.
- **Authorization reuses the finance RLS helpers.** Both functions call
  `has_school_admin_role` and `is_guardian_of_student` with the caller's own JWT,
  so "may pay" cannot drift from "may see this fee". Principal, teacher and
  platform operators are excluded, matching migration 13.
- **Method mapping.** `fee_payments.method` predates decision 4 and has no `ussd`
  or `bank_agent`. The payment row records `mobile_money` or `bank_transfer`
  respectively; `payment_events.payment_method` keeps the exact channel.
  Widening `fee_payments` was out of scope and is a small follow-up if wanted.
- **Currency is checked** against the fee before any row is written.

### The current verification boundary

The HTTP adapter is implemented against the documented sandbox API, but no
real sandbox charge or preauthorization has been verified. Deno tests and the
merchant-dependent runtime flow must be run when Deno and sandbox access are
available. The subscription migration and function require a separate reviewed
staging application before either journey can be tested end to end.

### The `amount_paid` grep check

Run from the repository root. It must print no lines:

```bash
{ sed -e 's/--.*$//' supabase/migrations/20260915000003_apply_payment_event.sql
  find supabase/functions -name '*.ts' -exec sed -e 's#//.*$##' {} \; ; } \
  | tr '\n' ' ' \
  | grep -oiE "(update[^;]{0,120}amount_paid|amount_paid[^;,]{0,20}=|\.update\([^)]*amount_paid|insert into public\.fee_records)"
```

At build time it printed nothing. The only `amount_paid` mentions in payment code
are constraint names in the function's exception handler, its comment, and one
read-only `select` in `access.ts`.

### Test fixture (created for the scripted run; does NOT resolve H.11)

Created in the demo school only and left in place so the run can be repeated:

- Auth users `pay-test-guardian@demo.nomcloud.test` (a guardian membership for
  Amina Yusuf, parent of Yusuf Ahmed) and `pay-test-admin@demo.nomcloud.test` (an
  administrator membership), each with a profile. Passwords are held outside the
  repository.
- Two `Payment Test` fees of 100 USD, one for Yusuf Ahmed and one for Layla Bashir.
- The run itself left three mock payments (30, 20, 10) and ten events on Yusuf's
  fee.

A temporary non-demo school, its administrator and its fee were created to prove
the mock refusal and then deleted. This fixture is the minimum these tests needed.
It is not a general demo seeding mechanism, so H.11 stays open.
