# Hale

Hale is a voice-first assistant for seniors with a caregiver dashboard. The mobile app records a turn, uploads it to Convex Storage, and calls a Convex action for transcription, session-bound tools, and speech synthesis. When a senior ends a chat, Convex stores deterministic cognitive-transcript metrics and optionally adds a short interpretation based only on those metrics and marker names.

## Read the code top-down

1. `packages/shared/src/constants.ts`, `schemas.ts`, and `cognitive.ts` — shared brand constant, input schemas, and pure transcript analysis.
2. `convex/schema.ts`, then `convex/lib/auth.ts` and `convex/lib/access.ts` — persisted data, role/link checks, and authorization.
3. `convex/users.ts`, `medications.ts`, `emergencyContacts.ts`, and `bills.ts` — caregiver CRUD and session-bound tool data.
4. `convex/pairing.ts` and `pairingInternal.ts` — short-lived pairing codes and role provisioning.
5. `convex/voice.ts`, `convex/analysisActions.ts`, then `convex/llm/config.ts`, `prompts.ts`, and `tools.ts` — voice turns, emergency handling, session analysis, and LLM configuration.
6. `apps/mobile/app/` and `apps/mobile/src/components/` — authentication, pairing, recording, reactive messages, cards, and playback.
7. `apps/dashboard/app/` and `apps/dashboard/src/components/` — caregiver overview, cognitive screening, transcript review, and care records.

```text
apps/mobile/       Expo app (expo-av, Clerk, Convex)
apps/dashboard/    Next.js App Router caregiver dashboard
convex/            Convex schema, authorization, analysis, alerts, voice, and retention
packages/shared/   shared schemas, APP_NAME, and pure cognitive metrics
```

`APP_NAME` is defined once in `packages/shared/src/constants.ts`. The cognitive analyzer is heuristic screening logic, not a clinically validated instrument. Scores are not medical diagnoses. Transcript excerpts are stored with flagged markers for caregiver review; the optional LLM interpretation receives only computed metrics and marker names, never transcript content or excerpts.

## Manual setup

The commands below are for you to run when ready. No deployment, account, secret, or live service setup has been run by this implementation. Use development credentials and a development Convex deployment while evaluating the app.

1. Install Node.js 20+ and pnpm, then install workspace dependencies:

   ```sh
   corepack enable
   corepack prepare pnpm@9.15.4 --activate
   pnpm install
   ```

2. Create a Clerk application yourself. Enable the **Native API** for mobile authentication and enable email/password sign-up and sign-in with email verification codes.

3. In Clerk, create a JWT template using the **Convex** preset, name it exactly `convex`, and add this custom claim:

   ```json
   "haleRole": "{{user.public_metadata.haleRole}}"
   ```

   Keep the preset’s Convex audience (`convex`) and issuer settings. Copy the Clerk issuer domain for the backend setting in step 5. Convex validates the signed `haleRole` claim against the corresponding `users.role` record.

4. Provision a caregiver in Clerk. In the caregiver’s **Public metadata**, set:

   ```json
   { "haleRole": "caregiver" }
   ```

   Roles are server-managed; the apps do not let a user choose a role. For existing Phase 1 accounts, replace the former role claim and public metadata field with `haleRole` before deploying the new app. Existing senior profiles and caregiver links remain in Convex; this implementation does not perform a live data migration.

5. Start Convex manually and follow its prompts to create or select your development deployment:

   ```sh
   export CLERK_JWT_ISSUER_DOMAIN="https://your-clerk-issuer-domain"
   pnpm dev:convex
   ```

   In another terminal, set backend environment variables on that development deployment (replace the sample values with your own):

   ```sh
   pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-clerk-issuer-domain"
   pnpm exec convex env set CLERK_SECRET_KEY "sk_..."
   pnpm exec convex env set OPENROUTER_API_KEY "..."
   pnpm exec convex env set ELEVENLABS_API_KEY "..."
   pnpm exec convex env set ELEVENLABS_VOICE_ID "..."
   ```

   Keep all provider secrets in Convex environment variables; do not put them in either app’s environment file. `OPENROUTER_API_KEY` is the only LLM credential. Model selection is only in `convex/llm/config.ts`: the primary is `nex-agi/nex-n2-pro:free`, with `openai/gpt-4o-mini` as the paid fallback. If the primary errors or fails tool validation, Hale retries once using the fallback. Free models may log prompts and outputs, so use only fake test data with the free model and switch to the paid fallback before real users. The analyzer stores deterministic results and fallback suggestions before its optional LLM interpretation call, so a failed interpretation still leaves a usable analysis.

   The voice request uses OpenRouter's `reasoning: { effort: "minimal" }` request option, added by the configured OpenAI-compatible provider fetch function. This minimizes reasoning overhead for the reasoning model. This workspace uses Vercel AI SDK v4, whose `maxTokens: 150` option maps to OpenRouter's output-token limit for voice replies. Session-end analysis uses the same primary/fallback configuration.

   Pairing sets the senior’s Clerk public metadata to `{ "haleRole": "senior" }` after a valid one-time code is claimed. A same-claimant retry is allowed to finish Clerk role provisioning; a different claimant cannot reuse the code.

6. Copy each app’s environment example and fill in public client configuration only:

   ```sh
   cp apps/dashboard/.env.example apps/dashboard/.env.local
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   Set the Clerk publishable key and Convex development URL in both files. Set `EXPO_PUBLIC_PAIRING_API_URL` to the dashboard’s `/api/pair` route reachable from the phone, such as `http://10.0.2.2:3000/api/pair` for the standard Android emulator or your machine’s LAN address for a physical phone.

7. Start the local development processes:

   ```sh
   export CLERK_JWT_ISSUER_DOMAIN="https://your-clerk-issuer-domain"
   pnpm dev
   ```

   Alternatively, run `pnpm dev:convex`, `pnpm dev:dashboard`, and `pnpm dev:mobile` separately. These commands connect to whichever Convex development deployment you selected; do not run them with a production deployment when testing changes.

8. Create a senior profile in the caregiver dashboard, generate a pairing code, and enter it in a senior account on the phone. Codes expire after ten minutes and are single-use across claimants. The dashboard’s emergency-alert banner is link-scoped and disappears after a caregiver acknowledges the alert.

## Local checks

These checks do not start Convex or contact a deployment:

```sh
pnpm test
pnpm typecheck
```

The tests use Vitest and an in-memory Convex test backend. They cover transcript metrics, prompt placeholder/timezone handling, tool-parameter privacy, OpenRouter fallback selection, role/link checks, pairing expiry and single-use behavior, cross-senior LLM-tool read/write isolation, emergency-path rate-limit exemption, alert acknowledgements, rate limits, and idempotent completion/analysis storage. Convex-generated files are ignored by Git; `pnpm dev:convex` creates them during manual setup. If they need refreshing, run `pnpm exec convex codegen --typecheck disable`; this writes local generated files and does not deploy functions.

## Screening behavior

- Analysis uses only senior-spoken text from a completed session. It reports lexical diversity, fillers, false starts, immediate repetition, pronoun ratios, word-finding phrases, pause markers, and repeated statements, with marker thresholds and evidence excerpts.
- The score is a transparent heuristic; the neutral bands are **No flags**, **Some flags**, and **Many flags**. Sessions with fewer than 50 senior words are not treated as scored sessions. A trend against that senior’s own earlier-session baseline appears after at least three scored sessions.
- Emergency phrases (`I fell`, `chest pain`, `can't breathe`, `help me`) are checked after transcription and before the voice LLM call. Matches are recorded for linked caregivers and receive a fixed spoken reply. Emergency turns bypass the standard limit of 30 non-emergency voice requests per senior per ten-minute window.

## Audio retention and deletion

User recordings and assistant speech are retained for 30 days. A daily Convex cron at 03:15 UTC removes expired Storage objects; registered but unprocessed uploads are tracked and expire too. Transcribed message text remains until the senior profile is deleted. Deleting a senior profile removes their linked records, analyses, alerts, sessions, messages, pairing codes, and stored or pending audio.
