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
- Installable patient PWA with browser install prompts, Home Screen guidance, and a privacy-safe offline fallback
- Foreground browser recording, segmented audio upload, retry handling, and seven-day raw-audio retention
- Conversation search and transcript detail views, with source-linked recall when processed records are available
- Backboard AI answers from available conversation evidence; separate assistants/memory are scoped by patient and signed-in member
- Nessie sandbox Care Costs view for bills, merchants, spending, explicit cost sharing, and confirmed P2P test transfers
- Optional, consent-based family voice enrollment through pyannote.ai
- Demo mode with synthetic fixtures

## Setup

Requirements: Node.js 22.12+ and Bun 1.3.14+.

1. Install dependencies: `bun install`
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and configure Clerk, TigerData, Backboard, and Nessie credentials.
3. Apply the PostgreSQL schema: `psql "$TIGERDATA_DATABASE_URL" -f db/schema.sql`
4. Start the app: `bun run dev`

For local UI exploration without external services, set `NEXT_PUBLIC_APP_MODE=demo`. For live mode, configure `TIGERDATA_DATABASE_URL`, Clerk keys, `APP_ORIGIN`, `BACKBOARD_API_KEY`, and `NESSIE_API_KEY`. The Nessie API base URL defaults to `https://api.nessieisreal.com` and can be overridden with `NESSIE_API_BASE_URL`. Set optional `PYANNOTE_API_KEY` to enable voice enrollment. Provider keys must remain server-only and must not use a `NEXT_PUBLIC_` prefix.

## Development checks

- `bun run test`
- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `bun run production:check`

## Current processing limits

Recording upload and storage are implemented, but a worker that transcribes uploaded conversations and extracts transcript turns/memories is not yet included. Until records have been processed, live search and recall may have no transcript evidence. Backboard provides the conversational AI layer; this repo does not currently wire a speech-to-text or text-to-speech provider. Family invitations and speaker matching are also not implemented.

Raw audio is stored in TigerData and expires after the patient-space retention period. Backboard's Auto memory is isolated by member and patient; deleting source evidence clears the corresponding Backboard assistant context. Cloud processing is not end-to-end encrypted. Use fictional information and consented test recordings for this prototype.

Nessie records in this project are sandbox data. Cost sharing is explicit, and P2P actions require user confirmation; they do not move real funds. A financial transaction is not evidence that a medication was taken or a care appointment occurred.
