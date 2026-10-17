# UI redesign parity checklist

This checklist maps each existing route and interaction to its redesigned presentation. Routes, redirects, data hooks, authorization checks, provider calls, and action handlers are unchanged.

## Second-pass visual contract and verification

- Inter is the shared typeface. Default text is 18px, with 16px, 20px, and 22px options; labels remain sentence case.
- The light palette uses `#F7FBF7` / white / `#E6F3E7` surfaces with Forest `#244C37` and Leaf `#5C906B`. Dark and both high-contrast palettes are documented with measured token-pair ratios in [`ui-contrast.md`](./ui-contrast.md).
- Standard outlines are 1px; High contrast uses 2px outlines, underlined links, and 3px offset focus rings. Family primary buttons use a subtle accent-to-Forest gradient; section surfaces do not use decorative gradients. Eyebrows are uppercase monospace labels.
- Header Display controls open a desktop popover or a mobile sheet. Settings provide the same theme, text-size, and reduced-motion preferences. High contrast defaults to light and exposes a separate Dark option.
- Shared Button variants, Radix-backed checkboxes/switches/dialogs/popovers/sheets/tabs/segmented controls, and shared Card/Badge styles provide common semantics and sizing without changing action handlers.
- Offline Playwright passed family/public-auth routes at 360px, 768px, and 1440px across Light, Dark, High contrast Light, and High contrast Dark at all four text sizes. Browser/API network requests are blocked, storage writes are monitored, and route checks report no console/Next.js issues or horizontal overflow. Representative family screenshots are stored in `ui-screenshots/`.

## Getting started

| Existing route/element | Redesigned location and appearance | Parity |
|---|---|---|
| `/` → `/login` | Same redirect; theme tokens also apply to the authentication surface. | Preserved |
| `/login` | Live mode keeps Clerk sign-in and its existing redirects. Local demo mode clearly explains that auth is disabled and links directly to the fictional family and patient workspaces; no pretend account is created. | Preserved; explicit demo entry points added |
| `/signup` | Family signup, patient/family account-type selector, Clerk form, and “signup alone grants no access” explanation remain visible; larger controls and green palette. | Preserved |
| `/signup/patient` | Patient signup and patient-space setup remain unchanged; same styled account form and consent explanation. | Preserved |
| `/signup/voice` | Name/relationship form, sample prompt, microphone capture, waveform/progress, sample playback, consent and “only my voice” confirmations, retake, upload, skip, processing, cancellation, delete/withdraw, and completion states remain in place. | Preserved |
| `/invite/accept` | Sign in/create account, invited-email requirement, token validation, loading/success/error states remain unchanged; shared auth presentation. | Preserved |
| `/family`, `/patient` | Existing redirects to family overview and patient Today remain unchanged. | Preserved |

## Family experience

| Route | Existing elements → redesigned presentation | Parity |
|---|---|---|
| `/family/overview` | Daily recap and provenance, empty state, conversation/voice/memory counts, coverage, quote/gentle reminder, familiar voices, memory cards, recent conversations, privacy note, care link, and footer disclaimer remain. Patient-space chip and four large links make Ask, calendar, Care & Tasks, and patient view prominent; recent items use bordered cards. | Preserved; shortcut links are more prominent |
| `/family/calendar` | Month arrows, keyboard date grid, today action, selected date, timezone/demo note, day recap/nightly summary, citation links, memory/conversation lists, and ask-about-day link remain. Recorded dates now show a count and accessible label in addition to the marker. | Preserved |
| `/family/conversations` | Search field, person/date filters, clear action, loading/error/count states, privacy note, and conversation destinations remain; results use larger responsive cards. | Preserved |
| `/family/conversations/[id]` | Back link, metadata/status, audio playback and timestamp seeking, transcript/speaker labels, summary, related memories, processing state/retry, privacy note, and deletion confirmation remain. Dialog is restyled; all same callbacks remain. | Preserved |
| `/family/ask` | Suggestions, question input/send, date scope, online-model opt-in and explanation, local/source recall, answers, citations, sidebar links, and privacy note remain; messages and citations use larger separated surfaces. | Preserved |
| `/family/care` | Rides/appointments/medication/cost sections remain the same tabs and update the same tab state. Uber location/quote/handoff, appointment provider link, reminder explanation, all record forms, Apple Reminders handoff, PDF consent/drafts/review/save, costs, and confirmations remain. | Preserved |
| `/family/people` | Person cards, relationship, linked-conversation counts, voice status, profile link, privacy explanations, and invitation area remain. Invite form, copy-link, pending list, revoke confirmation, and `sharing:manage` gate are unchanged. | Preserved |
| `/family/settings` | Voice readiness/profile controls, consent checkbox, enable/withdraw actions, access/privacy/retention details, install guidance, demo/live copy, and optional reset remain. New appearance settings are inserted above them. | Preserved; appearance controls added |

## Patient experience

| Route | Existing elements → redesigned presentation | Parity |
|---|---|---|
| `/patient/today` | Greeting/date, consent-gated recorder, care voice assistant, available upcoming reminders, memories, recent conversations, and Care & Tasks link remain. Recorder is the dominant action; memories and conversations show up to three cards followed by keyboard-accessible “See all” expanders. | Preserved; same items remain reachable |
| `/patient/ask` | Source-based recall, optional OpenRouter opt-in/explanation, suggested questions, date scope, answers/citations, sidebar destinations, and privacy notes remain. | Preserved |
| `/patient/memories` | Patient calendar, month/date selection, recap, memories/conversations, cited sources, and ask-about-day action remain. | Preserved |
| `/patient/conversations/[id]` | Patient-route back link, transcript/speaker labels, audio player/seek, summary/memories, retry, delete confirmation, and current permission checks remain. | Preserved |
| `/patient/care` | Ride, appointment, medication, and cost records; reminders; PDF draft review; provider handoffs; and consent/confirmation controls remain. Cost view still contains only explicitly shared items. | Preserved |
| `/patient/people` | Linked people, relationships, conversation counts, voice-match state, profile links, invitation controls, and the same capability gate remain. | Preserved |
| `/patient/settings` | Access/privacy, retention, voice-match consent/profile controls, phone-install guidance, and demo reset remain. Appearance settings are added above the original settings. | Preserved; appearance controls added |

## Shared controls and permission parity

| Existing control/state | Redesigned treatment | Parity |
|---|---|---|
| Family patient-space switcher, patient-view link, conversation-search link, account button | Persistent family header; mobile bottom bar uses compact Home/Dates/Chats/Care labels, with full accessible names and “More” for People/Ask/Settings. Current page and patient context remain visible. | Same routes and handlers |
| Patient Today/Ask/Memories nav, People/Settings, install prompt/guide, offline/demo labels, Family website handoff | Desktop top bar / mobile bottom bar uses compact Today/Ask/Memories labels with full accessible names and People/Settings under “More”; install and family links remain. Persistent compact recorder stays in its existing patient-shell location and retains the leave-recording confirmation. | Same routes and handlers |
| `recordings:create` gate; consent checkbox; start/pause/stop/resume/finish; elapsed time; upload retry; segment download/discard/details | Larger status indicator with microphone icon, state text, and timer; large Stop action; all segment controls remain in the expandable audio details. | Same gate and callbacks |
| `care` section buttons and hash synchronization | Shared `Tabs` presentation with the same selected tab and click callback. | Same tab state and hash handling |
| Appointment, ride, medication, and care-cost record forms | Larger labels, controls, and cards; all fields, validation, schedule options, reminder settings, create/delete rules, and handoffs remain. | Same forms/data flow |
| PDF import consent and extracted drafts | Larger consent, upload, editable draft fields, removal, and “review before saving” remain. | Same flow |
| Nessie seed/connect/unlink/share/unshare/test-transfer actions | Larger sandbox labels and cost cards; same confirmation prompts/dialog, amounts, recipients, requests, and results. No real-money behavior added. | Same handlers and sandbox gate |
| Voice matching and voice-profile controls | Readiness/status text, consent checkbox, enable/withdraw, profile manage/delete, and consent separation remain visible and prominent. | Same rules and API calls |
| Native dialogs and native `confirm()` prompts | Styled native dialogs retain open/close and confirmation handlers; existing browser confirmations for invitation revoke, Nessie unlink/unshare, and leaving patient mode remain browser confirmations. | Confirmation behavior preserved |
| `StatusPill`, `EmptyState`, memory/conversation/person cards, privacy notes, coverage, loading/errors/success | Shared tokens and accessible borders/labels; source links and status text remain. | Same content/routes |
| Demo/live mode; PWA worker/recording; remote model consent; provider connections | Same mode checks, browser recording, integrations, and provider behavior. Only presentation changed. | Preserved |

## Gap identified and kept explicit

The existing patient Today view receives upcoming reminder items inside the care voice assistant, but it does not receive full-day appointment/medication entries or completed/missed states. The redesigned timeline sorts and displays only those existing upcoming items with an “Upcoming” label. It does not infer “Due now,” “Done,” or “Missed.” Adding those statuses would require data not present in the current view and is intentionally not part of this UI-only change.

## Not changed

- No route, redirect, permission, query, mutation, provider call, environment variable, database, worker, transcription, assistant, voice-matching, PDF extraction, or Nessie logic.
- Invitation revocation and Nessie unlink/unshare still use the existing browser confirmation prompts; their wording and outcomes are unchanged.
- Browser/player native audio controls remain native; their size and surrounding surface are improved, while browser-specific playback widgets are not replaced.
