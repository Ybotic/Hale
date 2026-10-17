# Hale UI feature inventory — before redesign

Audit captured before UI changes. Routes, features, and controls below describe the original application. This is an interface inventory only; backend and permission behavior are documented as observed, not modified.

## Routes

### Entry, authentication, and onboarding

- **`/`** — redirects to `/login`.
- **`/login`** — Clerk sign-in card/form, link to family signup, signed-in next-step CTA, authentication-not-configured notice, loading state, private-account and access-based privacy copy.
- **`/signup`** — Clerk family signup; family/patient account-type links; link to login; signed-in continue CTA; message that joining does not grant access to patient memories.
- **`/signup/patient`** — Clerk patient signup; account-type links; next step for creating the caller’s own patient space.
- **`/signup/voice`** — optional account voice setup. Form fields: full name and relationship. Voice sample: prompt, microphone start/stop, progress waveform, sample playback, consent to provider processing, “only my voice” confirmation, retake, create profile, skip, and delete/withdraw. States: not introduced, sample ready, processing, failed, skipped, enrolled/completed, unavailable/unconfigured, and microphone/provider errors.
- **`/invite/accept`** — reads invitation token; signed-out sign-in and signup actions return to this route; signed-in token acceptance; invalid token, loading, accepted, and error states.
- **`/family`** — redirects to `/family/overview`.
- **`/patient`** — redirects to `/patient/today`.
- **Patient-space onboarding gate** — when a signed-in account has no patient space, fields for display name and timezone, recording/cloud-processing consent checkbox, create-space submit, error state, and provider/retention/privacy explanation.
- **Family-access gate** — for an invited family account with no accepted membership, explanation and “I accepted an invite — check access” action; sign-in/account control.

### Family routes

- **`/family/overview`** — date/name intro; today’s recap or empty/processing copy; timeline link; counts for conversations, familiar voices, saved memories; recording coverage; quote or gentle reminder; familiar-voice links; Ask Hale link; up to three memory cards; recent conversation list; calendar, Care & Tasks, patient-view, and privacy links.
- **`/family/calendar`** — previous/next month buttons; keyboard-operable 42-cell calendar with recording markers; today action; selected date; timezone/demo label; Ask about this day link; nightly summary/loading/coverage state; citation links to transcript turns; memory cards; original-conversation list; empty state/back-to-today link.
- **`/family/conversations`** — transcript search field; person filter; date filter (all/today); conditional Clear button; result count/loading/error/limited states; linked conversation rows/cards; privacy note.
- **`/family/conversations/[id]`** — back-to-all-conversations link; status/date/title/duration/speaker-turn metadata; capability-gated Delete button; audio player when available; timestamp seek buttons; processing status/retry; transcript with speaker/uncertainty labels; summary; voice links; memory cards; retention note; delete confirmation dialog with Keep/Delete actions; deletion loading/error state.
- **`/family/ask`** — suggested-question buttons; question textarea/Enter submit/send; selected date scope and clear-date link; optional OpenRouter consent checkbox and explanation; answer/local/source-based status; date resolution; citations to original transcript turns; links to calendar/conversation/care; loading/error and privacy/disclaimer copy.
- **`/family/care`** — Rides, Appointments, Medication records, Care costs section buttons; hash-to-section synchronization; care reminder delivery explanation; rides: route-name/address fields, pickup/destination latitude/longitude, browser geolocation action, quote request, quote results, Uber route handoff, ride records; appointments: optional Cal.com link, appointment records; medications: medication records, frequency/day/time/reminder controls, Apple Reminders handoff, PDF consent/upload, editable unsaved drafts, remove draft/save-reviewed-records; costs: Nessie account selection/link/unlink, fictional test-account seeding, bill/purchase list, share/unshare actions, recipient/amount, transfer confirmation dialog, transfer result/retry, manual care-cost records. Record creation is capability-gated; Nessie actions are sandbox-only.
- **`/family/people`** — person cards with initials/name/relationship/voice-matching enrollment and linked conversation count; voice/profile guidance and `/signup/voice` link; invitation email form/send; one-time link display/copy; pending invitation list/expiry/revoke; load/error/success states; privacy note. Invitation controls are hidden unless `sharing:manage` is present.
- **`/family/settings`** — family voice-profile readiness and profile list; voice status/manage/delete links; consent checkbox and enable/withdraw buttons per patient space; access/privacy rows; retention rows; PWA installation instructions/patient-view link; live/demo explanation; demo reset when provided.

### Patient routes

- **`/patient/today`** — date and greeting; RecorderCard; care voice assistant; today’s first two memories; today’s conversations; Care & Tasks link.
- **`/patient/ask`** — Ask Hale question flow and source links, scoped to patient routes.
- **`/patient/memories`** — patient calendar, date recap, memories/conversations, cited source links, ask-about-day action.
- **`/patient/conversations/[id]`** — patient-route conversation detail and same audio/transcript/retry/delete-confirmation actions as family detail.
- **`/patient/care`** — patient Care & Tasks. Patient device can enable/disable PWA reminders. Costs view shows only explicitly shared items. Demo has a fictional medication example with taken/skipped/unknown buttons and a confirm dialog.
- **`/patient/people`** — linked person cards, relationships, conversation counts, voice-matching state, profile link, and invitation UI if authorized.
- **`/patient/settings`** — voice status/consent/profile controls; access/privacy and retention information; iPhone/PWA install steps and patient Today link; demo/live explanation and optional demo reset.

## Shared shells and reusable UI

- **Family shell** — skip-to-main link; Hale brand link; patient-space switcher; Patient view link; conversation-search icon link; Clerk account button; Overview/Calendar/Conversations/Care & Tasks/People/Ask Hale/Settings navigation with active `aria-current`; demo banner and About this demo link; footer disclaimer.
- **Patient shell** — skip-to-main; Hale/Today link; People and Settings icon links; Today/Ask Hale/Memories bottom navigation; demo label; offline status; persistent compact recorder on non-Today patient routes; PWA install prompt/install guide/close action; family-website link guarded by unsent-recording confirmation; service-worker registration.
- **RecorderCard** — `recordings:create` gate; participant-consent checkbox; microphone start; pause; stop; resume; finish; timer/state/message; demo-only capture note; upload/segment state; retry; expandable audio details; per-segment download/discard; unsent-audio notice.
- **Care voice assistant** — provider availability/status; optional online-assistant consent checkbox and turn-off link; upcoming-reminder list and optional speak-reminders action; message textarea/send; voice-record/stop voice message; linked sources and suggested care destination; listen action; medication self-report note/save/cancel; returned audio controls; loading/error/notice/recording states.
- **Shared display components** — PageIntro, SectionHeading, ConversationList, MemoryCard, PeopleStack, StatusPill, EmptyState, PrivacyNote, Coverage; source cards link to their originating conversation/turn.
- **Details/disclosures** — recorder audio details and Apple Reminders shortcut instructions use native `<details>`.
- **Dialogs/prompts** — conversation delete uses `<dialog>`; demo medication self-report uses `<dialog>`; Nessie test transfer uses `<dialog>`; invitation revoke, Nessie unlink/unshare, and leaving patient mode use native browser `confirm()` prompts.

## Permission- and consent-gated elements

- Recording start/compact recorder requires `recordings:create`; full recorder asks for consent from everyone present and cloud audio processing before start.
- Care-record read/create/delete remains gated by the patient-space capabilities evaluated by the existing record panel: ride, appointment, medication, and sharing permissions are distinct.
- Family invitations are rendered only when the current space has `sharing:manage`.
- Voice profile enrollment is optional; matching opt-in/withdrawal is separate for each patient space and available to that profile’s owner; enrollment does not grant record access.
- Ask Hale only sends selected record excerpts to OpenRouter after the explicit optional checkbox is enabled.
- Patient care voice assistant requires separate online consent; voice capture and speech are additionally gated by existing provider readiness/consent.
- Medication PDF content is sent for extraction only after explicit consent; drafts are not saved until reviewed and submitted.
- Nessie account, transaction, share, and transfer controls operate only against the configured sandbox; patient-visible costs are only those a family member shared.
- PWA push subscription controls are patient-side; family view shows only the delivery explanation.
- Patient/family views share authorized space membership, but navigation does not grant access. Existing server authorization remains unchanged.

## Existing UI states

Loading/unavailable/auth-setup; signed-in/signed-out; invitation invalid/pending/accepted/error; patient-space missing/available; demo/live/offline; recorder idle/starting/recording/paused/interrupted/stopped/uploading/retry/error; voice sample ready/processing/failed/skipped/enrolled; worker queued/transcribing/diarizing/extracting/ready/failed/offline; Ask loading/local/online/error/insufficient-evidence; calendar empty/recorded/summary queued/partial/available; care provider unavailable/configured/no quotes; record form open/closed/saving/success/error; reminder configured/subscribed/unsubscribed/error; PDF draft/review/saving/success/error; Nessie unconfigured/unlinked/linked/shared/unshared/transfer pending/success/failure/review; voice matching off/on/withdrawn/not-ready; and access/permission denied.
