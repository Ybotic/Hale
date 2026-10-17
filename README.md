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
- Source-grounded Ask and patient voice assistant using the OpenRouter free model
- Optional Backboard LLM memory extraction and nightly summaries
- Conversation search and transcript detail views, with source-linked recall when processed records are available
- Backboard remains available for patient/member-scoped memory processing when enabled
- Nessie sandbox Care Costs view for bills, merchants, spending, explicit cost sharing, and confirmed P2P test transfers
- Patient-space records for rides, appointments, medication notes, and manually entered care costs
- Server-side Uber fare estimates (requires Uber API approval) and optional Cal.com scheduling links
- One-click creation of fictional Nessie sandbox customers and accounts for connector testing
- Patient dashboard voice assistant with ElevenLabs speech input/output and confirmation-gated medication self-reports
- Recurring medication/appointment reminders by PWA push, plus an Apple Shortcuts handoff for Apple Reminders
- Reviewed medication record drafts from PDFs using PyMuPDF and the OpenRouter free model
- Optional, consent-based family voice enrollment through pyannote.ai
- Demo mode with synthetic fixtures

## Setup

Requirements: Node.js 22.12+ and Bun 1.3.14+.

1. Install dependencies: `bun install`
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and configure Clerk, TigerData, OpenRouter, ElevenLabs, Backboard, and Nessie credentials. Allow `/invite/accept` as a Clerk invitation redirect URL.
3. Apply the PostgreSQL schema: `psql "$TIGERDATA_DATABASE_URL" -f db/schema.sql`
4. Start the app: `bun run dev`
5. In a second terminal, run `bun run worker` to process recordings and generate nightly summaries.

For local UI exploration without external services, set `NEXT_PUBLIC_APP_MODE=demo`. For live mode and the processing worker, configure `TIGERDATA_DATABASE_URL`, Clerk keys, `APP_ORIGIN`, `OPENROUTER_API_KEY`, `PYANNOTE_API_KEY`, and `NESSIE_API_KEY`. Chat pins a server-selected OpenRouter free model ending in `:free`; `OPENROUTER_CHAT_MODEL` can choose another free variant and `OPENROUTER_VISION_MODEL` can select a free vision variant for scanned PDFs. Voice input/output additionally requires server-only `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. The patient must opt in before records or voice are sent to OpenRouter or ElevenLabs. Backboard remains available for optional memory extraction and summaries, controlled by `BACKBOARD_PROCESSING_ENABLED`. PWA push reminders require `WEB_PUSH_VAPID_PUBLIC_KEY`, server-only `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` (generate a key pair with `bunx web-push generate-vapid-keys`); iPhone push requires installing Hale to the Home Screen on iOS 16.4 or newer. Uber quotes optionally use server-only `UBER_ACCESS_TOKEN` or `UBER_SERVER_TOKEN` credentials (Uber approval is required); appointment scheduling optionally uses the public `CALCOM_BOOKING_URL`. Apple Reminders handoff uses a user-created shortcut named `Hale Add Reminder`; Hale does not read or change existing Apple Reminders. Medication PDF import uses `PYMUPDF_PYTHON` or the project's Python 3.11 virtual environment. The voice assistant routes patients to provider booking pages and never claims a ride or appointment was booked automatically. The Nessie API base URL defaults to `https://api.nessieisreal.com` and can be overridden with `NESSIE_API_BASE_URL`. Provider keys must remain server-only and must not use a `NEXT_PUBLIC_` prefix.

## Development checks

- `bun run test`
- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `bun run production:check`

## Current processing limits

LLM-based memory extraction and nightly summaries run only while the worker is running and `BACKBOARD_PROCESSING_ENABLED=true`; OpenRouter handles chat separately. Medication PDF import uses PyMuPDF (`uv pip install --python .venv/bin/python -r apps/web/requirements-pdf.txt`) and may use a free OpenRouter vision model for image-only scans. Extracted drafts always require patient/family review before saving. PWA push reminders require VAPID keys and the long-running worker; medication schedules use patient-local times, while appointment reminders use configurable offsets. Apple Shortcuts can add reminders but cannot read existing Apple Reminders. For local GPU transcription, install `apps/web/requirements-gpu.txt` in a Python 3.11 virtual environment and run the worker with `LOCAL_WHISPER_GPU=true LOCAL_WHISPER_PYTHON=/path/to/python`; the `large-v3` model downloads on first use. Audio is transcribed on the local NVIDIA GPU and speaker names remain unknown; it is not sent to OpenRouter or pyannote.ai. Alternatively, set `TRANSCRIPTION_ONLY=true` to use OpenRouter transcription without speaker processing. Speaker identification is opt-in per patient space; uncertain speakers remain unnamed. There is not yet an Expo Android app, background capture, or wearable integration.

Raw audio is stored in TigerData and expires after the patient-space retention period. Backboard's Auto memory is isolated by member and patient; deleting source evidence clears the corresponding Backboard assistant context. Cloud processing is not end-to-end encrypted. Use fictional information and consented test recordings for this prototype.

## Database schema and worker deployment

- `db/schema.sql` is the canonical PostgreSQL schema and the only database-change entry point in this repository. Apply it to each environment before deploying web or worker code: `psql "$TIGERDATA_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql`. The application and worker do not run schema changes at startup.
- Run `bun run worker` as a separate, long-lived process using the same release as the web app. Configure `TIGERDATA_DATABASE_URL`, `OPENROUTER_API_KEY`, `PYANNOTE_API_KEY`, `BACKBOARD_API_KEY`, and `APP_ORIGIN` in the worker's server-side environment. `APP_ORIGIN` must be the public HTTPS origin of the web app so pyannote.ai can fetch temporary recording and voice-sample URLs; `localhost` and private-network URLs are not reachable by pyannote.ai.
- Use a process supervisor or container orchestrator to restart the worker after failures and deliver `SIGTERM`/`SIGINT` for graceful shutdown. The worker polls queued recordings and missing prior-day summaries; it does not need a separate cron trigger. Multiple worker replicas can claim work concurrently using database leases and `SKIP LOCKED`.
- Keep provider credentials out of browser variables and deployment logs. OpenRouter and pyannote credentials are needed by the worker; Clerk, Backboard, and the web app's other server credentials belong only in server-side environments that use them.

Nessie records in this project are sandbox data. Cost sharing is explicit, and P2P actions require user confirmation; they do not move real funds. A financial transaction is not evidence that a medication was taken or a care appointment occurred.

Apply the updated `db/schema.sql` before using care records or worker status. Uber fare estimates require Uber approval and a server token; they do not book or dispatch rides. Set `CALCOM_BOOKING_URL` to a public Cal.com scheduling link to enable the appointment-calendar handoff. The Nessie test-data action creates fictional customers and checking accounts in the configured Nessie sandbox only.

For local NVIDIA setup, create a Python 3.11 environment with `uv venv --python 3.11 .venv`, install `uv pip install --python .venv/bin/python -r apps/web/requirements-gpu.txt`, and run `LOCAL_WHISPER_GPU=true LOCAL_WHISPER_PYTHON="$PWD/.venv/bin/python" bun run worker`. The GPU runtime requires CUDA 12/cuDNN 9 libraries and downloads the Whisper model the first time it runs.
