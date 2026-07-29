# BUILD-PLAN.md — Phases

One agent session per phase, sequential. A phase starts only when the previous phase's acceptance criteria pass. Engine test suite must be green at every merge from Phase 2 onward.

## Phase 0 — Scaffold ☐

Base scaffold already exists (Better-T-Stack: TanStack Start web + Hono/oRPC server on Cloudflare Workers + Drizzle/Neon Postgres + Better Auth — see `.claude/CLAUDE.md`). Remaining Phase 0 work: add the Better Auth magic-link plugin (stubbed to console in dev), replace the todo example with the domain schema from `SCHEMA.md`, seed script (admin user, 1 event, 3 interviewers, mixed rules). Test tooling (Vitest) is added when Phase 1 needs it — keep tooling minimal at this scale.

**Accept:** `pnpm check` green across workspace; admin can sign in; interviewer magic-link flow works end-to-end in dev (link printed to console); seeded DB inspectable; schema matches SCHEMA.md exactly; web calls the server through the oRPC client with full type inference.

## Phase 1 — Slot engine ☐

`packages/engine` pure implementation of `SLOT-ENGINE.md`. No routes, no UI.

**Accept:** every edge case in SLOT-ENGINE §"Ordering and edge cases" has a named test; DST tests pass in `America/New_York` and `Europe/London`; property test: no generated slot overlaps a buffer zone or exceeds capacity.

## Phase 2 — Admin + interviewer availability ☐

- Admin: create/edit event_type (all config fields, validation incl. increment divides 1440), interviewer roster, invite generation, open/close event.
- Interviewer (Better Auth magic-link session): calendar grid, drag-select to paint weekly and one-off intervals, 15-min snap, exception dates. Week view with weekly rules ghosted onto future weeks.

**Accept:** painted availability round-trips to rules correctly (e2e); editing a rule live-changes the computed slots (verified via engine call in test).

## Phase 3 — Public booking page ☐

`/e/[slug]`: aggregate slot list/calendar (event timezone shown), no interviewer identity or counts leaked, name+email form, invite-token gate when `access=invite`, transactional selection per BOOKING-FLOW, 30 s polling + refetch-on-conflict.

**Accept:** two concurrent selections of a capacity-1 slot ⇒ exactly one succeeds (e2e race test); closed/draft events and out-of-window slots unreachable; response payload contains no interviewer data.

## Phase 4 — Confirmation flow ☐

Emails via Resend, tokenised confirm/decline/manage endpoints, full state machine, expiry cron, reassignment with exclusion list and cap, manual-assign path.

**Accept:** every transition in BOOKING-FLOW has an integration test; expiry job idempotent; declined interviewer's token dead after reassignment; email snapshots reviewed.

## Phase 5 — Self-service manage + .ics ☐

Manage page (cancel / reschedule-as-rebook), interviewer cancel, `.ics` attachments on confirmation, invite `used_count` release on cancellation.

**Accept:** reschedule produces a new `selected` booking and cancels the old atomically; `.ics` imports cleanly into Google Calendar and Apple Calendar.

## Phase 6 — Integrations (future) ☐

Zoom meeting creation on confirm when `location_type=emeet` (store `meeting_url`), Google/Outlook calendar sync for interviewers, webhook/API surface.

**Accept:** defined when phase is scoped.

## Deviation log

Record spec deviations here with date and the spec file updated.

| Date | Phase | Deviation | Spec updated |
| ---- | ----- | --------- | ------------ |
| 2026-07-11 | 0 | Primary keys are prefixed CUID2 (`@paralleldrive/cuid2`) instead of UUID; column helpers in `@repo/db/lib/utils`. Better Auth tables keep their generated text IDs. | SCHEMA.md, CLAUDE.md |
