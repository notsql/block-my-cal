# BOOKING-FLOW.md — State machine, holds, emails, assignment

## States

```
                       ┌────────────────────────────────────────────┐
                       │            (reassign, count < 3)           │
                       ▼                                            │
  [interviewee   ── selected ──(interviewer confirms)──▶ confirmed  │
   selects slot]       │                                    │       │
                       ├──(interviewer declines)────────────┼───────┤
                       ├──(hold_expires_at passes)──────────┼───────┘
                       │        └── if no reassignment possible ──▶ expired / declined (terminal, slot released)
                       └──(interviewee cancels via manage link)──▶ cancelled
                                                            │
                                     confirmed ──(either party cancels)──▶ cancelled
```

Terminal states: `confirmed` (until cancelled), `declined`, `expired`, `cancelled`. Active (hold capacity + trigger buffer): `selected`, `confirmed`.

## Selection (interviewee)

1. Interviewee picks a slot on the public page. If `access = invite`, a valid invite token is required; validate + increment `used_count` in the same transaction as the insert.
2. **Transaction**: recompute this slot via the engine (fresh reads) → still has capacity and ≥1 free interviewer? → insert booking `selected`, set `hold_expires_at = now + hold_expiry_hours`, assign interviewer (below). Abort with a friendly "slot just taken" if not.
3. The hold immediately reduces `remainingCapacity` for all viewers. Public page polls `GET /api/events/[slug]/slots` every 30 s and refetches on booking failure.
4. Emails: interviewer → confirmation request (confirm/decline links, tokenised); interviewee → "selection received, pending interviewer confirmation".

## Assignment

- `auto_assign = true`: choose from the slot's `freeInterviewers` by **least confirmed+selected bookings in that calendar week; tie → random**. Rationale: spreads load; round-robin state isn't worth persisting.
- `auto_assign = false`: booking is created **unassigned**; admin is emailed to assign from the free list. `hold_expires_at` still runs — admin inaction ⇒ expiry path.

## Confirm / decline (interviewer)

- Links contain a single-use token; hitting them requires no login. Confirm → `confirmed`, clear hold, email interviewee (with `.ics` from Phase 5, meeting link from Phase 6). Token invalidated.
- Decline → attempt **silent reassignment**: recompute free interviewers for the slot excluding all who previously declined this booking; pick per assignment rule; increment `reassign_count`; issue new token; email new interviewer; reset `hold_expires_at`. Interviewee is _not_ notified of reassignment (anonymity holds).
- No candidate or `reassign_count = 3` → status `declined`, release slot, email interviewee: "slot unavailable, please pick another" with link back.

## Expiry

- A Cloudflare Cron Trigger on `apps/server` (every 15 min in v1) finds `selected` bookings past `hold_expires_at` → same path as decline (reassign if possible, excluding the non-responder; else `expired` + interviewee email).

## Cancel / reschedule (self-service)

- Interviewee `manage` link: cancel (any active status) or reschedule. **Reschedule = cancel + new selection** — it re-enters the confirmation flow. Do not build in-place slot mutation.
- Interviewer cancelling a `confirmed` booking (via a link in their confirmation email): attempts reassignment first; only if none, cancel + apologise-email to interviewee.
- Cancelling releases capacity instantly and decrements the invite's `used_count`.

## Emails (Resend, all templates in `packages/email` — created when Phase 4 starts)

| Trigger                    | To                                      | Content                                                 |
| -------------------------- | --------------------------------------- | ------------------------------------------------------- |
| Selection created          | Interviewer (or admin if manual assign) | Slot time, confirm/decline links, expiry deadline       |
| Selection created          | Interviewee                             | Pending notice, manage link                             |
| Confirmed                  | Interviewee                             | Final details, manage link, (.ics / meeting link later) |
| Confirmed                  | Interviewer                             | Interviewee name+email, calendar info                   |
| Reassigned                 | New interviewer                         | Same as confirmation request                            |
| Declined/expired, released | Interviewee                             | Re-book prompt                                          |
| Cancelled                  | Counterparty                            | Notice                                                  |

All emails render times in `event_type.timezone`, DD/MM/YYYY, 24-hour, with timezone named explicitly.

## Token rules

- Confirm/decline: single-use, bound to (booking, assigned interviewer generation) — reassignment invalidates the old token.
- Manage: multi-use until booking terminal.
- Store SHA-256 hashes only; raw token appears only in the email URL.
