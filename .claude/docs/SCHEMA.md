# SCHEMA.md — Persisted data

PostgreSQL via Drizzle (`packages/db`). Only **availability rules** and **bookings** are persisted. Slots are always derived (see `SLOT-ENGINE.md`). All timestamps `timestamptz` (UTC) unless stated. All tables get `id` (prefixed CUID2 PK — see below), `created_at`, `updated_at`.

**IDs.** Primary keys are prefixed CUID2s (`@paralleldrive/cuid2`), not UUIDs, generated via `createId(prefix)` from `@repo/db/lib/cuid` — e.g. `evt_<cuid>`, `book_<cuid>`. The prefix identifies the table and makes IDs self-describing in logs and URLs. Registered prefixes live in `CUID_PREFIXES` in `packages/db/src/lib/cuid.ts`; adding a table means adding its prefix there in the same commit. Column helpers (`primaryKeyColumn`, `foreignKeyColumn`, `dateColumns`) live in `@repo/db/lib/utils`. Better Auth tables keep Better Auth's own text IDs — they are generated, not hand-authored, and are exempt from the CUID convention. Better Auth manages its own tables (`user`, `session`, `account`, `verification`) via the Drizzle adapter — generate with `npx @better-auth/cli generate`, never hand-edit.

## event_type

One row per interview process (e.g. "SWE Intern Round 1"). Owned by an admin.

| Column               | Type                               | Default        | Notes                                                                                                             |
| -------------------- | ---------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| name                 | text                               | —              |                                                                                                                   |
| slug                 | text unique                        | —              | Public URL segment                                                                                                |
| duration_min         | int                                | —              | Interview length. Required.                                                                                       |
| slot_increment_min   | int                                | = duration_min | Grid step. Must divide 60 or be a multiple of 30. See SLOT-ENGINE.                                                |
| buffer_min           | int                                | 1440           | Gap enforced around an interviewer's confirmed/held bookings.                                                     |
| capacity_per_slot    | int                                | 1              | Max concurrent bookings per slot. Admin may raise it, ceiling = free interviewers at that slot (engine-enforced). |
| auto_assign          | bool                               | true           | false ⇒ admin assigns manually before confirmation email goes out.                                                |
| booking_window_start | timestamp                          | —              | Interviewees can only book slots inside this window.                                                              |
| booking_window_end   | timestamp                          | —              |                                                                                                                   |
| min_notice_min       | int                                | 1440           | Slots starting sooner than this from "now" are not offered.                                                       |
| hold_expiry_hours    | int                                | 24             | How long an unconfirmed selection holds the slot.                                                                 |
| location_type        | enum `in_person` \| `emeet`        | in_person      | `emeet` ⇒ meeting link on confirmation (Phase 6).                                                                 |
| location_detail      | text null                          | —              | Address, or meeting-link template note.                                                                           |
| access               | enum `public` \| `invite`          | public         | `invite` ⇒ booking requires a valid invite token.                                                                 |
| owner_user_id        | FK → user                          | —              | Admin who owns this event.                                                                                        |
| timezone             | text (IANA)                        | Asia/Singapore | Display + weekly-rule expansion timezone.                                                                         |
| status               | enum `draft` \| `open` \| `closed` | draft          | Only `open` events accept bookings.                                                                               |

## interviewer

| Column        | Type            | Notes                                                                                   |
| ------------- | --------------- | --------------------------------------------------------------------------------------- |
| event_type_id | FK              | Interviewers are scoped per event in v1.                                                |
| user_id       | FK → user, null | Better Auth user, linked on first magic-link sign-in (match by email). Null until then. |
| name          | text            | Never exposed on the public aggregate view.                                             |
| email         | text            | Magic links and confirmation requests go here.                                          |
| active        | bool            | Soft-disable without deleting rules.                                                    |

## availability_rule

| Column          | Type                       | Notes                                                                                       |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| interviewer_id  | FK                         |                                                                                             |
| kind            | enum `weekly` \| `one_off` |                                                                                             |
| day_of_week     | int 0–6 null               | Weekly only. 0 = Monday.                                                                    |
| date            | date null                  | One-off only. In event timezone.                                                            |
| start_time      | time                       | Local to `event_type.timezone`.                                                             |
| end_time        | time                       | Exclusive. Must be > start_time; intervals do not cross midnight (paint two rules instead). |
| effective_from  | date null                  | Weekly only; null ⇒ booking window start.                                                   |
| effective_until | date null                  | Weekly only; null ⇒ booking window end.                                                     |

Overlapping rules for the same interviewer are legal; the engine unions them.

## availability_exception

Kills one occurrence of an interviewer's weekly availability (holiday, sick day).

| Column         | Type | Notes                                                       |
| -------------- | ---- | ----------------------------------------------------------- |
| interviewer_id | FK   |                                                             |
| date           | date | Whole day, event timezone. All weekly rules skip this date. |

## booking

| Column                  | Type           | Notes                                                                                               |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| event_type_id           | FK             |                                                                                                     |
| slot_start_utc          | timestamp      | Unique-per-capacity with event_type_id (transactional count, not a DB unique constraint).           |
| interviewee_name        | text           |                                                                                                     |
| interviewee_email       | text           |                                                                                                     |
| status                  | enum           | `selected` \| `confirmed` \| `declined` \| `expired` \| `cancelled` — transitions per BOOKING-FLOW. |
| assigned_interviewer_id | FK null        | Set at selection (auto-assign) or by admin.                                                         |
| hold_expires_at         | timestamp null | Set on `selected`; cleared on `confirmed`.                                                          |
| reassign_count          | int default 0  | Increments on decline/expiry reassignment; cap = 3, then release.                                   |
| confirm_token_hash      | text           | Interviewer's confirm/decline link. Single use.                                                     |
| manage_token_hash       | text           | Interviewee's cancel/reschedule link.                                                               |
| meeting_url             | text null      | Phase 6.                                                                                            |
| invite_id               | FK null        | If event access = `invite`.                                                                         |

Active statuses (count against capacity and interviewer buffer): `selected`, `confirmed`.

## invite

| Column        | Type          | Notes                                                                                                |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| event_type_id | FK            |                                                                                                      |
| token_hash    | text unique   | Unique booking link per interviewee.                                                                 |
| label         | text          | Admin's reference (e.g. candidate name) — never shown publicly.                                      |
| max_uses      | int default 1 |                                                                                                      |
| used_count    | int default 0 | Incremented on booking creation; decremented if that booking is cancelled/expired/declined-released. |

## auth (Better Auth)

- `user.role`: `admin` | `interviewer` (Better Auth `additionalFields`). Sign-ups disabled; admin created by seed script, interviewer users created implicitly on first magic-link sign-in (`magicLink` plugin, `sendMagicLink` → Resend).
- Admin routes: session + role `admin`. Interviewer availability routes: session + matching `interviewer.user_id`.
- Interviewees never get accounts. Booking confirm/decline/manage links remain custom single-purpose tokens (below), independent of Better Auth.
- `event_type.owner_user_id` FK → user (the admin who created it) — add to event_type table.

## Indexes

- booking: `(event_type_id, slot_start_utc, status)`
- booking: `(assigned_interviewer_id, status)` — buffer computation
- availability_rule: `(interviewer_id)`
- invite: `(token_hash)`
