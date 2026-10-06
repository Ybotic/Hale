# Snow Phase 1 Implementation Plan

## Scope

- pnpm/Turbo workspace with Expo mobile, Next.js caregiver dashboard, Convex backend, and shared Zod schemas.
- Clerk roles from trusted `publicMetadata.snowRole`; caregivers create senior records and seniors claim them with a short-lived, one-time pairing code.
- Convex authorization for every user-facing data operation, including the actor-to-senior link and session ownership.
- Caregiver CRUD for senior profiles, medications, emergency contacts, and bills.
- Senior voice loop: Expo recording and upload, Convex/ElevenLabs transcription, Vercel AI SDK with one model config and session-bound tools, ElevenLabs Flash speech, reactive message playback/cards.
- End chat and 30-day audio retention with profile-deletion cleanup.
- README with Clerk/Convex manual setup and exact local commands; no deployment, account creation, or secret provisioning by this agent.

## Work sequence

1. [x] Establish workspace/package configuration and shared schemas.
2. [x] Implement Convex schema, Clerk role/pairing, authorization, CRUD, voice actions/tools, audio retention, and cascade deletion.
3. [x] Implement Expo authentication/pairing/voice UI and the caregiver dashboard CRUD pages.
4. [x] Review cross-package imports, confirm no LLM tool accepts `seniorId`, document the setup/tree, and run local checks without connecting to live infrastructure.

## Verification constraints

- Do not run Convex deployment/dev against a live project or provision Clerk/ElevenLabs/OpenAI credentials.
- Typechecked shared, mobile, dashboard, and Convex sources with temporary local Convex API declarations; root `pnpm typecheck` requires a configured `CONVEX_DEPLOYMENT` for `convex codegen` and was not run against a deployment. Temporary declarations were removed.
- Confirmed the mobile Babel config parses. No service accounts, secrets, environment variables, or deployments were created.
