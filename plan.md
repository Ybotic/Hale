# Hale Phase 2 Implementation Plan

## Scope

- Replace the Phase 1 product name with Hale throughout the workspace, centralize the name as `APP_NAME` in `packages/shared`, and use the neutral `@care/*` package scope.
- Add fully unit-tested, pure transcript metrics and a transparent 0–100 heuristic with neutral marker-count bands and evidence excerpts.
- Analyze each completed senior session once, persist the result, and use the configured LLM only for a plain-language interpretation and general preventative-care suggestions from metrics and marker names.
- Use OpenRouter through the OpenAI-compatible Vercel AI SDK provider. Keep primary/fallback models in `convex/llm/config.ts` and credentials in `OPENROUTER_API_KEY` on Convex.
- Add caregiver overview, cognitive trend, and transcript-review pages; show a screening-not-diagnosis notice anywhere a score is displayed.
- Detect emergency phrases before the voice LLM call, create link-scoped alerts, provide a fixed voice reply, and exempt emergency turns from the 30-per-ten-minute non-emergency voice limit.
- Add caregiver alert acknowledgement and hide acknowledged alerts from the banner.
- Test role/link authorization, pairing expiry and claim behavior, cross-senior LLM-tool isolation, rate limiting, alert acknowledgement, idempotent session completion/analysis, prompt placeholders, tool-parameter privacy, and model fallback.
- Keep all credentials in Convex environment variables. Do not deploy, provision accounts, run app commands against production, or contact live infrastructure.

## Work sequence

1. [x] Inspect Phase 1 architecture and propose files/schema for approval.
2. [x] Implement shared cognitive metrics, branding, and the additive Convex schema.
3. [x] Implement session analysis, emergency handling, alert acknowledgement, and per-senior rate limiting.
4. [x] Add caregiver overview, baseline trend, and transcript review pages.
5. [x] Add Vitest/Convex in-memory security and LLM tests plus the root test command.
6. [x] Update manual setup documentation and run local tests/typechecks only.

## Verification constraints

- Never run Convex deployment/dev, Clerk provisioning, secret setup, or any command targeting live infrastructure as part of implementation.
- `pnpm test` runs local Vitest tests against pure functions and an in-memory Convex test backend.
- `pnpm typecheck` performs local TypeScript checks without Convex code generation or a deployment connection.
- The analysis labels and score thresholds are screening heuristics, not clinically validated or diagnostic measures.
