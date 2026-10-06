# Snow

Snow is a voice-first assistant for seniors with a caregiver dashboard. The mobile app records a turn, uploads it to Convex Storage, and calls a Convex action for transcription, LLM/tool execution, and speech synthesis. Convex messages drive the mobile chat reactively.

## Read the code top-down

1. `packages/shared/src/schemas.ts` — Zod inputs, domain types, and card payloads shared by both apps and the backend.
2. `convex/schema.ts`, then `convex/lib/auth.ts` and `convex/lib/access.ts` — persisted data and role/link checks.
3. `convex/users.ts`, `medications.ts`, `emergencyContacts.ts`, and `bills.ts` — caregiver CRUD and session-bound tool data.
4. `convex/pairing.ts` and `pairingInternal.ts` — short-lived pairing codes and Clerk role provisioning.
5. `convex/voice.ts`, then `convex/llm/config.ts`, `prompts.ts`, and `tools.ts` — end-to-end voice turn. The swappable model is selected only in `config.ts`.
6. `apps/mobile/app/` and `apps/mobile/src/components/` — authentication, pairing, recording, reactive messages, cards, and playback.
7. `apps/dashboard/app/` and `apps/dashboard/src/components/` — senior profile, medications, contacts, and bills.

```text
apps/mobile/       Expo app (expo-av, Clerk, Convex)
apps/dashboard/    Next.js App Router caregiver dashboard
convex/            Convex schema, authorization, CRUD, voice actions, retention cron
packages/shared/   shared Zod schemas and inferred types
```

`convex/_generated/` is created by Convex codegen and is intentionally not checked in.

## Manual setup checklist

Nothing in this checklist has been run. It creates/configures accounts and connects the project to your chosen services when you run it.

1. Install Node.js 20+ and pnpm, then install workspace dependencies:

   ```sh
   corepack enable
   corepack prepare pnpm@9.15.4 --activate
   pnpm install
   ```

2. Create a Clerk application yourself. Enable the **Native API** for mobile authentication and enable email/password sign-up and sign-in with email verification codes (the mobile screens use those flows).

3. In Clerk, create a JWT template using the **Convex** preset, name it exactly `convex`, and add this custom claim to the preset’s claims:

   ```json
   "snowRole": "{{user.public_metadata.snowRole}}"
   ```

   Keep the preset’s Convex audience (`convex`) and issuer settings. Copy the Clerk issuer domain for the backend setting in step 5. Convex reads `snowRole` from that signed token and checks it against the `users.role` record.

4. Provision a caregiver in Clerk. In the caregiver’s **Public metadata**, set:

   ```json
   { "snowRole": "caregiver" }
   ```

   This is server-managed metadata; the apps do not let a user choose a role. When that caregiver signs in to the dashboard, Snow creates their caregiver record. Seniors are created by caregivers in the dashboard and do not need a Clerk account before pairing.

5. Start Convex from the repository root and follow its prompts to create or select your development deployment:

   ```sh
   export CLERK_JWT_ISSUER_DOMAIN="https://your-clerk-issuer-domain"
   pnpm dev:convex
   ```

   The issuer domain is public configuration read by `convex/auth.config.ts`; keep it exported in terminals that run Convex commands. In a second terminal, set the backend variables on that Convex deployment (replace each quoted value with your own):

   ```sh
   pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-clerk-issuer-domain"
   pnpm exec convex env set CLERK_SECRET_KEY "sk_..."
   pnpm exec convex env set OPENAI_API_KEY "sk-..."
   pnpm exec convex env set ELEVENLABS_API_KEY "..."
   pnpm exec convex env set ELEVENLABS_VOICE_ID "..."
   ```

   `CLERK_SECRET_KEY` stays in Convex: after a valid code is consumed, the Convex pairing action calls Clerk’s Backend API to set `public_metadata.snowRole` to `senior`. The mobile app calls the dashboard’s `/api/pair` route, which forwards the authenticated Convex token and code. The role update is retriable with the same code if Clerk is temporarily unavailable. OpenAI and ElevenLabs secrets are used only by Convex actions.

   After the variables are set, stop the standalone `pnpm dev:convex` process with Ctrl-C; step 7 starts it alongside both apps.

6. Copy each app’s environment example and fill in its public client configuration. Do not put backend secrets in either app:

   ```sh
   cp apps/dashboard/.env.example apps/dashboard/.env.local
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   Set the Clerk publishable key and Convex deployment URL in both files. Set `EXPO_PUBLIC_PAIRING_API_URL` to the dashboard route reachable from the phone, for example `http://10.0.2.2:3000/api/pair` for the standard Android emulator or your development machine’s LAN address for a physical phone.

7. Start all three development processes:

   ```sh
   export CLERK_JWT_ISSUER_DOMAIN="https://your-clerk-issuer-domain"
   pnpm dev
   ```

   Or start them separately with `pnpm dev:convex`, `pnpm dev:dashboard`, and `pnpm dev:mobile`. For generated Convex types and local TypeScript checks, run `pnpm typecheck`.

8. Sign in to the dashboard with the caregiver account, create a senior profile, and generate a pairing code. On the phone, create/sign in to a senior account and enter that code. Codes are single-use and expire after ten minutes; generating a replacement revokes the previous unused code.

## Audio retention

User recordings and assistant speech are retained for 30 days. A daily Convex cron at 03:15 UTC removes expired Storage objects; registered but unprocessed uploads are tracked and expire too. The cleanup processes batches of up to 1,000 message recordings and 1,000 abandoned uploads per run, with any backlog handled on later runs. Transcribed message text remains until the senior profile is deleted. Deleting a senior profile removes their linked records, sessions, messages, pairing codes, and stored or pending audio.
