# SLOT-ENGINE.md — Slot computation

Pure functions in `packages/engine`. No I/O, no DB, no ambient clock. This spec is normative; tests encode it.

## Signature

```ts
computeSlots(input: {
  eventType: EventTypeConfig        // duration, increment, buffer, capacity, window, min_notice, timezone
  interviewers: InterviewerId[]     // active only
  rules: AvailabilityRule[]
  exceptions: AvailabilityException[]
  activeBookings: ActiveBooking[]   // status ∈ {selected, confirmed}: slot_start_utc, assigned_interviewer_id, duration implied by eventType
  now: Date                         // caller-supplied, never Date.now()
}): Slot[]

type Slot = {
  startUtc: Date
  remainingCapacity: number         // what the public view shows as bookable count (or just "available" when 1)
  freeInterviewers: InterviewerId[] // internal — for auto-assignment; never sent to the public client
}
```

Public API strips `freeInterviewers` and any interviewer count before the response leaves the server. The public view must not leak how many interviewers exist.

## Pipeline

Per interviewer:

1. **Expand rules → concrete intervals** over `[max(now + min_notice, window_start), window_end]`, in the event timezone.
   - Weekly: every matching `day_of_week` between `effective_from/until` (clamped to window), skipping dates in `availability_exception`.
   - One-off: the given date. One-off rules ignore exceptions.
   - Convert each local interval to UTC _after_ expansion (this makes weekly rules DST-correct: 09:00 local stays 09:00 local).
2. **Union overlapping/adjacent intervals** for that interviewer.
3. **Subtract booking blocks**: for each active booking assigned to this interviewer, remove `[slot_start − buffer, slot_start + duration + buffer]`.
4. **Cut to grid**: within each remaining interval, generate candidate starts at every grid point where `[start, start + duration] ⊆ interval`.

Then aggregate:

5. **Group by startUtc** across interviewers. `freeInterviewers` = interviewers contributing that start.
6. **Capacity**: `remainingCapacity = min(capacity_per_slot, |freeInterviewers|) − activeBookingsAtSlot`. Drop slots ≤ 0.
7. Sort ascending.

## Grid definition

- Grid points: local times anchored to **midnight of each day in the event timezone**, stepping by `slot_increment_min`.
- `slot_increment_min` must divide 1440. Enforce at config validation.
- Consequence: an interval 09:10–12:00 with a 30-min increment yields first candidate start 09:30. Edge time is dropped by design — do not engineer around it.
- Availability-painting UI snaps to a 15-min grid; the engine re-snaps regardless (UI snap is UX, engine snap is truth).

## Ordering and edge cases (all must have tests)

- Buffer subtraction (step 3) happens **before** grid cutting (step 4), per interviewer — a booking removes that interviewer from surrounding slots but not others.
- Buffer spanning midnight and spanning the booking-window boundary: clamp, don't error.
- Two rules overlapping (weekly + one-off same day): union, no double-counting in capacity.
- Interviewer with zero rules: contributes nothing, no error.
- DST spring-forward: a weekly 09:00–13:00 rule on the skipped day still yields 09:00 local (which is a different UTC offset); a rule covering the skipped hour (e.g. 01:00–04:00 in a spring-forward zone) yields the intervals that actually exist. Use `Temporal` polyfill or `date-fns-tz`; never do manual offset arithmetic.
- `now` inside a slot: that slot is excluded by min_notice anyway (min_notice ≥ 0).
- Empty result is valid, not an error.

## Performance

Bound: window ≤ 366 days, increments ≥ 5 min ⇒ ≤ ~105k grid points/interviewer worst case. Plain in-memory computation is fine; recompute per request. **No caching in v1** — correctness first. If needed later, cache key = `(event_type_id, updated_at of config/rules/bookings)`, invalidated by write, never TTL.
