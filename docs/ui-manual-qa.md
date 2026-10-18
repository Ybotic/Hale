# Hale UI manual QA checklist

The route/theme/size matrix is intentionally left unchecked for hands-on verification. For **each family/public-auth route**, visit all 16 combinations: **Light, Dark, High contrast Light, High contrast Dark × Small, Default, Large, Extra large**. High contrast starts with its light palette; its Dark choice is available directly below the High contrast theme control.

The automated offline demo matrix for this phase covers `/`, auth routes, and `/family/*` at 360px, 768px, and 1440px across those 16 theme/text combinations. It blocks external hosts and `/api/backend/`, stubs service-worker registration, and fails on browser storage writes, console errors, Next.js issues, or horizontal overflow. It also captures representative family screenshots in `docs/ui-screenshots/`. This automated result does not replace the hands-on keyboard and assistive-technology checks below.

## Route matrix

- [ ] `/` — redirect to `/login`
- [ ] `/login`
- [ ] `/signup`
- [ ] `/signup/patient`
- [ ] `/signup/voice`
- [ ] `/invite/accept`
- [ ] `/family` — redirect to `/family/overview`
- [ ] `/family/overview`
- [ ] `/family/calendar`
- [ ] `/family/conversations`
- [ ] `/family/conversations/[id]`
- [ ] `/family/ask`
- [ ] `/family/care`
- [ ] `/family/people`
- [ ] `/family/settings`
- [ ] `/patient` — redirect to `/patient/today`
- [ ] `/patient/today`
- [ ] `/patient/ask`
- [ ] `/patient/memories`
- [ ] `/patient/conversations/[id]`
- [ ] `/patient/care`
- [ ] `/patient/people`
- [ ] `/patient/settings`

## Cross-route visual and responsive checks

- [ ] Light/Dark follows the OS color scheme when there is no saved theme; High contrast starts light and offers a separate Dark scheme.
- [ ] Text size defaults to 18px; Reduce motion follows the OS setting until explicitly changed.
- [ ] Explicit theme, text-size, and Reduce motion choices persist after reload using localStorage only.
- [ ] The no-write verification run leaves browser storage unchanged unless a preference is explicitly selected.
- [ ] Theme selection and text size have a visible selected state and are keyboard-operable in both header and Settings.
- [ ] Inter sans-serif, 18px default text, sentence-case labels, and no text smaller than 16px at Small size. Confirm the four sizes are 16px, 18px, 20px, and 22px.
- [ ] Standard borders remain 1px; High contrast uses 2px outlines and 3px offset focus rings. Links are underlined in High contrast.
- [ ] Primary buttons use the subtle green gradient; no section or container uses a decorative gradient. Eyebrow labels use uppercase monospace styling.
- [ ] Check every theme at 200% browser zoom; no clipped controls, hidden copy, or horizontal page scrolling.
- [ ] Check each experience at 360px, 768px, and desktop widths through 1440px; repeat across all four themes and four text sizes.
- [ ] Check with reduced motion enabled in system settings and with Hale’s Reduce motion control.
- [ ] Keyboard-only pass: skip link, all navigation, More menus, appearance controls, date grid, forms, tabs, expanders, dialogs, audio controls, and focus return after closing dialogs.
- [ ] Screen-reader pass: landmarks/headings, active navigation, current patient-space name, status/loading/error announcements, recording indicator/timer, date counts, timeline labels, source citations, dialogs, and expanded/collapsed states.
- [ ] Verify the medical-service disclaimer remains visible in family and patient experiences.
- [ ] Verify family patient-space switcher and Patient view link remain visible at narrow widths; compact mobile navigation labels retain their full accessible names.
- [ ] Verify patient Today/Ask Hale/Memories and patient More (People/Settings) are available at mobile and desktop sizes, including the largest text setting.

## Functional parity checks

- [ ] Recording requires the existing consent checkbox; no recording starts before consent.
- [ ] In local demo mode, `/login` offers explicit family/patient demo links; neither link creates an account or uses live data. Live mode sign-in remains on the existing Clerk flow.
- [ ] Start, pause, stop, resume, finish, upload retry, segment download/discard, and the persistent compact recorder work as before.
- [ ] Active recording shows icon, “Recording” text, timer, screen-reader announcement, and a large Stop recording button.
- [ ] Switching routes while recording retains the compact patient-shell recorder and the existing family-view leave confirmation.
- [ ] Patient timeline shows only existing upcoming reminders; no completion or missed state is invented.
- [ ] Ask Hale has no welcome prompts, suggested questions, online-answer toggle, or chat disclaimer; live answers use OpenRouter by default and demo answers remain local.
- [ ] Ask answers and calendar recaps retain source links to the original transcript.
- [ ] Conversation audio playback, timestamp seeking, retry behavior, and transcript speaker attribution work.
- [ ] Delete conversation still opens a confirmation dialog; cancel and confirm both work.
- [ ] Care tabs preserve hash selection and switch the same existing content.
- [ ] Ride estimates, location request, Uber handoff, appointment scheduling handoff, record forms, reminders, and Apple Reminders handoff remain unchanged.
- [ ] Medication PDF import still requires consent; drafts remain unsaved until reviewed and explicitly saved.
- [ ] Medication demo self-report still requires confirmation.
- [ ] Nessie sandbox badge and no-real-money message remain visible; seeding, linking, sharing, unlinking, and unsharing remain unchanged.
- [ ] Nessie sandbox contribution still requires its explicit confirmation dialog; no real funds move.
- [ ] Family invitation creation, one-time link copy, pending list, and existing revoke confirmation work.
- [ ] Patient/member permission-gated controls appear only under their original capabilities.
- [ ] Voice-profile enrollment consent and per-patient-space matching consent remain distinct; enable/withdraw/delete controls behave as before.
- [ ] PWA install prompt, install guide, service-worker registration, and offline message remain available.
- [ ] Demo mode stays clearly labeled with fictional data; live mode does not silently fall back to demo content.

## Suggested test personas and data modes

- [ ] Demo mode on both family and patient views.
- [ ] Live family member with read-only access.
- [ ] Live member with `sharing:manage` and invitation permissions.
- [ ] Live patient with recording and care-record capabilities.
- [ ] Live family member without medication-record permissions.
- [ ] Live space with consented voice profiles and one with none.
- [ ] Nessie unavailable, unlinked, linked, shared-cost, and test-transfer confirmation states.
- [ ] Empty, queued, processing, failed, and ready conversation states.
