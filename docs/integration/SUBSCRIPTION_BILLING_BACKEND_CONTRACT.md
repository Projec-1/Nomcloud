# Subscription & Billing backend integration contract

**Status:** Local implementation contract; not evidence of a deployed or live-verified service.  
**Reviewed:** 2026-10-22

## Scope and ledgers

School subscriptions use `subscription_plans`, `school_subscriptions`, `platform_invoices`, and `platform_payments`. Student fees remain in the separate `fee_records` / `payment_events` / `fee_payments` flow. Subscription checkout does not write to the student-fee ledger.

The local client calls `POST /functions/v1/subscription-checkout` through the authenticated Supabase Functions client. The function validates the caller's JWT and requires an active school owner/director role plus the `billing_ledger` feature flag for every action. Its service-role reads and RPC calls happen only after that authorization check. The two checkout RPCs are granted to `service_role`, not browser API roles.

## Actions

Every request contains a UUID `school_id` and one of these `action` values:

| Action | Additional request fields | Response |
|---|---|---|
| `catalog` | None | `{ plans }` containing public database plans with monthly/annual prices and currency. |
| `history` | None | `{ invoices, payments }`, scoped to that school; up to 50 recent invoices and up to 100 related payment records. |
| `start` | `plan_code` (`starter` or `growth`), `billing_interval` (`monthly` or `annual`), UUID `idempotency_key`, and `account_no` | Invoice/payment identifiers, authoritative amount and currency, status, and, after verified success, subscription/period identifiers. |
| `enterprise-enquiry` | `enquiry` with contact person, email, phone, country, student range, optional campus count, and requirements | `{ submitted: true, enquiry_id }` after the enquiry is saved to `contact_messages`. |

Enterprise is not a fixed-price checkout option. Saving an enquiry does not activate Enterprise or claim that an email was delivered.

## Pricing and checkout behavior

`20261023120000_subscription_checkout.sql` seeds Starter and Growth prices and an Enterprise enquiry-only row using `ON CONFLICT (code) DO NOTHING`; an existing plan is not overwritten. The seed values are USD 60/600 (monthly/annual) for Starter and USD 100/1000 for Growth. Confirm those values against approved product pricing before release. The backend reads the public plan row and computes the amount; it does not trust a client-supplied price.

Checkout creates or reuses a valid open invoice and creates a pending payment before contacting the provider. The database serializes checkout for the school, rejects an existing active/trial subscription and blocks new attempts while a prior payment is `pending` or `unknown`. A repeated idempotency key for the same school, plan, and interval returns the existing attempt without another provider purchase; reusing it for a different order is rejected.

The provider result is accepted as successful only when it is approved and its reference, transaction ID, response/event ID, amount, and currency match the checkout. Declined/cancelled responses become `failed`; provider-pending responses remain `pending`; provider errors or mismatches remain `unknown`. A pending or unknown attempt is not a success and must not be retried blindly. The finalization RPC locks and updates the payment, invoice, and subscription together, activating a subscription only for a verified success and recording the billed period.

Mock payments are limited to the reserved demo school. The shared provider adapter is restricted to the configured sandbox endpoint. The account number is passed to the provider and is not used as the price or authorization source.

## Feature flag and permissions

The local platform-controls migration seeds `billing_ledger` as disabled. A platform administrator must explicitly enable it after the required schema, function, permission, and environment checks pass. Do not enable it to make an unavailable backend appear functional.

Direct browser access to checkout/finalization RPCs is revoked. The Edge Function checks the caller's active owner/director membership and the feature flag, then uses server-side credentials for the narrowly scoped billing operations. Billing history is queried for the authorized school only.

## Known limitations and release prerequisites

- The subscription migration and `subscription-checkout` function are local only; the connected project's read-only inventory reported the function missing and the prerequisite billing schema absent.
- No recurring renewal/charge workflow, provider webhook receiver, provider status polling, or automated reconciliation path is implemented. Pending/unknown payments can require operator-led recovery.
- No authenticated remote test, sandbox transaction, or provider callback was performed. No real-money test is authorized by this contract.
- Remote activation requires a verified database recovery plan, approved non-production migration and permission checks, a Deno/runtime check, server-side sandbox configuration, and deployment/smoke tests. Keep the flag disabled until those checks pass.

The local client treats only a server-confirmed `succeeded` result as success. `pending` and `unknown` states are shown as unresolved and should direct the user to verify status or contact billing support rather than initiate a duplicate payment.
