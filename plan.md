# Nessie Care Ledger Implementation Plan

## Goal

Add a Nessie-powered **Care Costs** feature to Hale so a patient and their authorized family can understand upcoming care-related bills, review spending, and coordinate a sandbox peer-to-peer contribution. Keep Nessie clearly labeled as mock financial data; no real money movement or automatic payments.

## Product scope

- Add a **Care Costs** section to the existing Care & Tasks experience.
- Let an account owner connect/select a Nessie sandbox account and view its mock balance.
- Show upcoming/paid bills, merchants, and a date-filtered list of purchases or transactions.
- Provide totals for selected care-related expenses. Let the user explicitly label a bill or transaction as a shared care cost; never infer that a purchase means a medication was taken or an appointment happened.
- Offer a reviewed, confirmed Nessie sandbox P2P contribution between demo accounts. Show the result as a sandbox transfer, not a real payment.
- Show family members only the costs explicitly shared with the patient space. Keep account balances and unshared transactions private to the account owner.

## Architecture

1. **Server-only Nessie client** — add `apps/web/src/lib/server/nessie.ts` using `NESSIE_API_KEY` and a configurable `NESSIE_API_BASE_URL` from the Nessie developer portal. Apply request timeouts, validate resource IDs and amounts, and return sanitized provider errors. Never call Nessie from browser code or expose its key through `NEXT_PUBLIC_*`.
2. **TigerData schema** — add tables through `db/schema.sql` for account links, explicitly shared care-cost items, and transfer records. Store Nessie customer/account/resource IDs and audit metadata, not API credentials. Treat Nessie as source of truth for mock account, bill, merchant, and transaction records.
3. **Authorized API routes** — add routes under `apps/web/src/app/api/backend/nessie/`. Authenticate with Clerk and enforce account-owner or patient-space membership checks beside the SQL access. Support listing accounts and care costs, sharing/unsharing a cost, and a confirmed sandbox transfer.
4. **Care UI** — extend the existing Care & Tasks view. The family side can inspect its linked account and choose which costs to share; the patient side sees only shared cost items, not account-level financial details.
5. **Sandbox demo data** — seed or select fictional Nessie customers, accounts, bills, merchants, and transactions that make the demo repeatable. Keep a visible “Nessie sandbox · no real funds” label on the financial views and transfer confirmation.

## Transfer flow

1. User chooses a bill and recipient from authorized demo accounts.
2. Server validates the amount, source account ownership, recipient account, and bill association; it stores a pending transfer record with a unique request identifier.
3. User reviews the exact source, recipient, amount, and bill, then explicitly confirms.
4. Server submits the transfer to Nessie and records the returned transfer ID/status in TigerData. Retries must not create duplicate transfers.

No model-generated or inferred amount may be sent to Nessie. Backboard is not used to trigger financial actions or receive raw transaction histories; initial totals and labels are deterministic.

## Build sequence

1. Confirm Nessie sandbox base URL, API-key auth, and the documented account/bill/merchant/purchase/transfer request shapes.
2. Implement and mock-test the server-side Nessie client.
3. Add TigerData tables and authenticated API routes, including explicit sharing, audit records, and transfer idempotency.
4. Add the Care Costs UI and fixture-backed demo path.
5. Verify authorization boundaries, error/timeout states, duplicate-transfer protection, lint, typecheck, tests, and production build.

## Acceptance criteria

- No Nessie key or private account data is sent to browser code or Backboard.
- Patients see only costs explicitly shared with their patient space; account owners retain control of their account link and sharing choices.
- Bills, merchants, and transaction totals are traceable to Nessie sandbox resources.
- A sandbox transfer requires explicit confirmation and is recorded with its provider result; no action is described as real-world payment.
- Existing ride, appointment, medication, recording, and recall flows remain intact.
