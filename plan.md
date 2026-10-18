# Hale Implementation Plan

## Nessie Care Ledger

### Goal

Add a Nessie-powered **Care Costs** feature to Hale so a patient and their authorized family can understand upcoming care-related bills, review spending, and coordinate a sandbox peer-to-peer contribution. Keep Nessie clearly labeled as mock financial data; no real money movement or automatic payments.

### Product scope

- Add a **Care Costs** section to the existing Care & Tasks experience.
- Let an account owner connect/select a Nessie sandbox account and view its mock balance.
- Show upcoming/paid bills, merchants, and a date-filtered list of purchases or transactions.
- Provide totals for selected care-related expenses. Let the user explicitly label a bill or transaction as a shared care cost; never infer that a purchase means a medication was taken or an appointment happened.
- Offer a reviewed, confirmed Nessie sandbox P2P contribution between demo accounts. Show the result as a sandbox transfer, not a real payment.
- Show family members only the costs explicitly shared with the patient space. Keep account balances and unshared transactions private to the account owner.

### Architecture

1. **Server-only Nessie client** — add `apps/web/src/lib/server/nessie.ts` using `NESSIE_API_KEY` and a configurable `NESSIE_API_BASE_URL` from the Nessie developer portal. Apply request timeouts, validate resource IDs and amounts, and return sanitized provider errors. Never call Nessie from browser code or expose its key through `NEXT_PUBLIC_*`.
2. **TigerData schema** — add tables through `db/schema.sql` for account links, explicitly shared care-cost items, and transfer records. Store Nessie customer/account/resource IDs and audit metadata, not API credentials. Treat Nessie as source of truth for mock account, bill, merchant, and transaction records.
3. **Authorized API routes** — add routes under `apps/web/src/app/api/backend/nessie/`. Authenticate with Clerk and enforce account-owner or patient-space membership checks beside the SQL access. Support listing accounts and care costs, sharing/unsharing a cost, and a confirmed sandbox transfer.
4. **Care UI** — extend the existing Care & Tasks view. The family side can inspect its linked account and choose which costs to share; the patient side sees only shared cost items, not account-level financial details.
5. **Sandbox demo data** — seed or select fictional Nessie customers, accounts, bills, merchants, and transactions that make the demo repeatable. Keep a visible “Nessie sandbox · no real funds” label on the financial views and transfer confirmation.

### Transfer flow

1. User chooses a bill and recipient from authorized demo accounts.
2. Server validates the amount, source account ownership, recipient account, and bill association; it stores a pending transfer record with a unique request identifier.
3. User reviews the exact source, recipient, amount, and bill, then explicitly confirms.
4. Server submits the transfer to Nessie and records the returned transfer ID/status in TigerData. Retries must not create duplicate transfers.

No model-generated or inferred amount may be sent to Nessie. Backboard is not used to trigger financial actions or receive raw transaction histories; initial totals and labels are deterministic.

### Build sequence

1. Confirm Nessie sandbox base URL, API-key auth, and the documented account/bill/merchant/purchase/transfer request shapes.
2. Implement and mock-test the server-side Nessie client.
3. Add TigerData tables and authenticated API routes, including explicit sharing, audit records, and transfer idempotency.
4. Add the Care Costs UI and fixture-backed demo path.
5. Verify authorization boundaries, error/timeout states, duplicate-transfer protection, lint, typecheck, tests, and production build.

### Acceptance criteria

- No Nessie key or private account data is sent to browser code or Backboard.
- Patients see only costs explicitly shared with their patient space; account owners retain control of their account link and sharing choices.
- Bills, merchants, and transaction totals are traceable to Nessie sandbox resources.
- A sandbox transfer requires explicit confirmation and is recorded with its provider result; no action is described as real-world payment.
- Existing ride, appointment, medication, recording, and recall flows remain intact.

## Audio transcription and speaker matching

### Provider responsibilities

- **OpenRouter Whisper-1** transcribes recorded audio and returns timestamped text segments where supported.
- **pyannote.ai** performs diarization and identifies enrolled voiceprints. pyannote is not the transcription engine.
- Uncertain or low-confidence speaker matches remain **Unknown**; spoken names alone never identify a voice. Voiceprints are for organizing memories, never authentication.

### Processing flow

1. Keep browser recording foreground-only; upload each existing audio chunk to TigerData with its patient, session, sequence, capture time, consent, and retention metadata.
2. A server-side worker claims queued `processing_jobs` using an atomic lease/row-lock pattern, so parallel workers and retries cannot create duplicate turns or memories.
3. Send chunk audio to Whisper through a server-side multipart request. Give pyannote a short-lived, random-token URL for the same chunk if its endpoint requires a fetchable URL. Expire the URL after the job and never log it.
4. Align transcript timestamps with pyannote speaker segments. Store transcript turns with source chunk, start/end time, speaker label, optional matched `people.id`, confidence/uncertainty, and provider job IDs.
5. Retry transient provider failures with bounded backoff. Mark unrecoverable jobs failed without inventing transcript text or speaker identity. Keep raw audio under the existing retention policy and surface incomplete processing in the UI.

### Consent and privacy

- Update recording consent and privacy copy to name TigerData, OpenRouter, and pyannote.ai and explain their roles and applicable retention.
- Start third-party processing only for recordings with the required patient and participant consent.
- Keep `OPENROUTER_API_KEY` and `PYANNOTE_API_KEY` server-only. Validate upload types, lengths, provider responses, timestamps, and patient ownership at the API boundary.
- Add tests for job idempotency, retry/expiry behavior, transcript alignment, unknown-speaker fallback, and unauthorized cross-patient reads.

## Memory extraction and nightly summaries

### Evidence-backed extraction

- After transcription and speaker alignment succeed, send only that patient’s transcript turns and stable turn IDs to Backboard with a narrow structured-output prompt.
- Ask Backboard for candidate memories with a kind (`reported_activity`, `plan`, `personal_fact`, `conversation_topic`), concise text, local date, and source turn IDs. Distinguish what was said, what was planned, and what was reported as completed.
- Use a no-automatic-memory mode for extraction. Validate the response shape and verify every cited turn belongs to the same patient and source conversation before writing to TigerData `memories`.
- Keep TigerData memories and transcripts as the canonical evidence. Backboard output without valid source turns is discarded; recall continues to cite the original transcript.

### Nightly summary job

- Add a durable `daily_summaries` record keyed by patient and patient-local date, including summary text, source turn IDs, coverage/status, and generation timestamps.
- Run summaries from a scheduled server-side worker after the day's processing jobs finish. If jobs are still pending or failed, label coverage as partial instead of presenting the summary as complete.
- Generate the summary from verified transcript turns/memories using Backboard, store the final summary in TigerData, and make the calendar date open that day's timeline and summary.
- Make the job idempotent and safe to rerun when late chunks finish. Never turn a plan into a claim that an event occurred, and preserve citations to the original conversations.

### Worker and verification

- Add a separate worker process that polls/claims TigerData jobs and supports a scheduled nightly run; the current Next.js request handlers are not a durable background-job runner.
- Store attempts, lease/claim time, and sanitized error codes in the job state. Do not put audio, transcript text, API keys, or provider payloads in logs.
- Test with mocked OpenRouter, pyannote, and Backboard responses, including partial days, duplicate deliveries, invalid citations, and late-arriving recordings.

## Family invitations and patient-space access

### Role of Clerk and TigerData

- **Clerk handles identity, sign-in, verified email, and optionally invitation email delivery.** Use the signed-in Clerk `userId` and verified primary email on the server; never trust an email or subject supplied by the browser.
- **TigerData remains the authorization source of truth.** Accepting an invitation creates an active `memberships` row with a restricted family capability set. A Clerk account, family profile, or voice profile alone never grants access to patient records.
- Do not introduce Clerk Organizations for the MVP; that would duplicate the existing patient-space membership and capability model. Use Clerk only for identity and invitation delivery.

### Invitation flow

1. A patient-space member with `sharing:manage` enters the invitee's email and selects from a server-defined family permission preset.
2. The server creates a `family_invitations` row containing patient ID, normalized email, inviter, capability preset, SHA-256 token hash, expiry, status, and audit timestamps. Store only the token hash.
3. Send a single-use acceptance link through Clerk invitation delivery (or provide a copyable link if delivery is not configured). The link contains a high-entropy token and expires after a short period.
4. The invitee signs in/signs up with Clerk, then accepts. The server verifies the token, expiry, non-revoked state, and exact match to the invitee's verified email; in one TigerData transaction it consumes the invitation, creates the membership, and writes an audit event.
5. Patient-space administrators can list pending invitations, revoke them, and resend/replace expired invitations. A consumed or revoked token can never be reused.

### Authorization tests and acceptance

- Add `family_invitations` to `db/schema.sql` with indexes/constraints for active invitations, expiry, and one-use acceptance.
- Place invite management in the existing family People/Settings experience and add a focused acceptance route.
- Verify that signup without acceptance grants no patient access, an email mismatch is rejected, an expired/revoked token is rejected, and members can only access the invited patient with the issued capabilities.
- Test invite acceptance and membership creation transactionally, including concurrent acceptance attempts and an audit event.

## Patient PWA UI Polish

### Scope

- Refine the patient PWA only; do not restyle or change the family dashboard.
- Keep routes, layout structure, recording, consent, provider selection, data flows, and authentication behavior unchanged.

### Changes

1. Reduce the patient PWA’s heavy borders to finer, softer green outlines and subtler shadows, including high-contrast-safe treatments.
2. Give the Today screen’s **Memories** quick-action tile a restrained tactile finish: pastel green/white surface, dark-green lower edge, soft green shadow, a small top highlight, hover lift, and pressed state. Keep its size and navigation behavior.
3. Simplify the patient header context: align the patient name at the right, remove the redundant “Today” beneath the name on Today, and use the existing roman editorial serif styling for the greeting name.
4. Center each bottom-navigation icon and label consistently within its existing hit target.
5. Make the four Today quick-action tiles readable on phone widths without clipping or splitting words; retain existing navigation and content.
6. Visually group patient consent controls so they read as deliberate, accessible choices rather than stray checkboxes. Keep the recording and provider-consent gates and their behavior intact.

### Verification

- Run the patient Playwright tests at narrow phone widths and confirm the consent controls still gate their actions.
- Run the repository checks and production build.
- Review a phone-width patient Today screenshot and confirm family pages remain unchanged.

## Weekly Conversation PDF and Copy Cleanup

### Scope

- Add a weekly transcript summary download above the search controls on Family → Conversations.
- Keep transcript reads behind the current Clerk identity and TigerData `memories:read` membership check.
- In live mode, generate the summary server-side with the existing OpenRouter integration after an explicit family-side opt-in. Keep the API key server-only.
- Report transcript-grounded observations only. Do not score or diagnose amnesia or another condition. Demo mode uses isolated fictional fixtures and a static sample PDF.

### Changes

1. Add an authenticated seven-day summary route and return a formatted PDF generated from the OpenRouter summary, deterministic activity stats, source citations, and transcript excerpts.
2. Include dates, conversation counts, a per-day activity graphic, AI-written overview/highlights/plans, exact repeated-question wording, and transcript excerpts with their conversation/date context. Clearly mark the report as non-diagnostic.
3. Replace the `New recording` placeholder when transcript turns become available with a concise title derived from the transcript; render a transcript-derived fallback for existing placeholder rows.
4. Simplify backend/vendor-specific interface copy. Replace provider-consent checkboxes with plain-language switches; remove the per-recording prompt and rely on the existing patient-space setup agreement. Keep other online/voice opt-ins.
5. Move the recap icon upward, remove the conversation search implementation note and footer disclaimer, and remove the “Where did I leave my keys?” suggestion.
6. Remove the Uber fare-estimate/token integration. Keep a direct patient Uber link and omit the Family Rides tab.
7. Seed demo care records and Nessie-style account/transaction data without live API calls; add a static fictional demo PDF download.

### Verification

- Test seven-day date selection, server AI-summary validation/citations, PDF structure/content, and repeated-phrase observations using fictional transcripts.
- Verify the report endpoint rejects unauthenticated users and members without `memories:read`.
- Test transcript-derived titles for greetings, punctuation, empty text, and long turns.
- Run checks/build and verify the Conversations export, patient chat, demo account, and care flows.
