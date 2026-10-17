# Hale

> Healthcare remembered.

Hale is a healthcare memory aid for patients and families. It helps keep care conversations and important details within reach; it supports remembering, not diagnosis or treatment, and does not replace professional care.

## Stack

- **Web:** Next.js, React, TypeScript, Clerk
- **Database:** TigerData / Tiger Cloud PostgreSQL, accessed with the `postgres` Node.js driver
- **AI:** Backboard SDK for source-grounded recall and scoped assistant memory
- **Voice enrollment:** Optional pyannote.ai voiceprint processing
- **Shared contracts:** `packages/contracts`

TigerData is PostgreSQL-compatible; this project connects through its PostgreSQL connection string rather than a vendor-specific SDK.

## Features

- Patient and family sign-in, onboarding, dashboards, calendar, people, and settings
- Role-limited family invitations delivered through Clerk and accepted into TigerData patient-space memberships
- Installable patient PWA with browser install prompts, Home Screen guidance, and a privacy-safe offline fallback
- Foreground browser recording, segmented audio upload, retry handling, and seven-day raw-audio retention
- Worker-based OpenRouter Whisper transcription and pyannote diarization/voiceprint matching with per-patient opt-in
- Backboard-backed source-validated memory extraction and patient-local nightly summaries
- Conversation search and transcript detail views, with source-linked recall when processed records are available
- Backboard AI answers from available conversation evidence; separate assistants/memory are scoped by patient and signed-in member
- Nessie sandbox Care Costs view for bills, merchants, spending, explicit cost sharing, and confirmed P2P test transfers
- Optional, consent-based family voice enrollment through pyannote.ai
- Demo mode with synthetic fixtures

## Setup

Requirements: Node.js 22.12+ and Bun 1.3.14+.

1. Install dependencies: `bun install`
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and configure Clerk, TigerData, Backboard, and Nessie credentials. Allow `/invite/accept` as a Clerk invitation redirect URL.
3. Apply the PostgreSQL schema: `psql "$TIGERDATA_DATABASE_URL" -f db/schema.sql`
4. Start the app: `bun run dev`
5. In a second terminal, run `bun run worker` to process recordings and generate nightly summaries.

For local UI exploration without external services, set `NEXT_PUBLIC_APP_MODE=demo`. For live mode and the processing worker, configure `TIGERDATA_DATABASE_URL`, Clerk keys, `APP_ORIGIN`, `BACKBOARD_API_KEY`, `OPENROUTER_API_KEY`, `PYANNOTE_API_KEY`, and `NESSIE_API_KEY`. The Nessie API base URL defaults to `https://api.nessieisreal.com` and can be overridden with `NESSIE_API_BASE_URL`. Provider keys must remain server-only and must not use a `NEXT_PUBLIC_` prefix.

## Development checks

- `bun run test`
- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `bun run production:check`

## Current processing limits

Live transcription, diarization, source-validated memory extraction, and nightly summaries run only while the worker is running and the OpenRouter, pyannote.ai, and Backboard credentials are configured. Speaker identification is opt-in per patient space; uncertain speakers remain unnamed. There is not yet an Expo Android app, background capture, or wearable integration.

Raw audio is stored in TigerData and expires after the patient-space retention period. Backboard's Auto memory is isolated by member and patient; deleting source evidence clears the corresponding Backboard assistant context. Cloud processing is not end-to-end encrypted. Use fictional information and consented test recordings for this prototype.

## Database schema and worker deployment

- `db/schema.sql` is the canonical PostgreSQL schema and the only database-change entry point in this repository. Apply it to each environment before deploying web or worker code: `psql "$TIGERDATA_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql`. The application and worker do not run schema changes at startup.
- Run `bun run worker` as a separate, long-lived process using the same release as the web app. Configure `TIGERDATA_DATABASE_URL`, `OPENROUTER_API_KEY`, `PYANNOTE_API_KEY`, `BACKBOARD_API_KEY`, and `APP_ORIGIN` in the worker's server-side environment. `APP_ORIGIN` must be the public HTTPS origin of the web app so pyannote.ai can fetch audio through the short-lived worker-audio URL.
- Use a process supervisor or container orchestrator to restart the worker after failures and deliver `SIGTERM`/`SIGINT` for graceful shutdown. The worker polls queued recordings and missing prior-day summaries; it does not need a separate cron trigger. Multiple worker replicas can claim work concurrently using database leases and `SKIP LOCKED`.
- Keep provider credentials out of browser variables and deployment logs. OpenRouter and pyannote credentials are needed by the worker; Clerk, Backboard, and the web app's other server credentials belong only in server-side environments that use them.

Nessie records in this project are sandbox data. Cost sharing is explicit, and P2P actions require user confirmation; they do not move real funds. A financial transaction is not evidence that a medication was taken or a care appointment occurred.
