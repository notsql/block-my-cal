# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠ Start here (every session)

1. **Read [`.claude/docs/BUILD-PLAN.md`](.claude/docs/BUILD-PLAN.md) and find the current phase.** Work is sequential — do not start a phase before the previous one's acceptance criteria pass. Update phase status and the deviation log at session end.
2. Read the spec doc(s) governing that phase (see table below).
3. Before reporting a task complete, run the checks in [Before reporting complete](#-before-reporting-complete).

## What this is

An interview scheduling tool ("block-my-cal"): interviewers paint availability, interviewees see an anonymous aggregate of slots and book, the assigned interviewer confirms by email. The product specs live in `.claude/docs/` and are **normative** — the spec is the source of truth; deviations get written into the spec, not left implicit in code.

| Doc                                               | Governs                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`SCHEMA.md`](.claude/docs/SCHEMA.md)             | All persisted data. Schema changes update this doc in the **same commit**.                        |
| [`SLOT-ENGINE.md`](.claude/docs/SLOT-ENGINE.md)   | Pure slot computation, the core of the product. Change this **before** changing engine behaviour. |
| [`BOOKING-FLOW.md`](.claude/docs/BOOKING-FLOW.md) | Booking state machine, holds, emails, auto-assignment.                                            |
| [`BUILD-PLAN.md`](.claude/docs/BUILD-PLAN.md)     | Phase order, acceptance criteria, deviation log.                                                  |

## Non-negotiable invariants

1. Slots are never stored — always computed from availability rules + bookings on read. No slot table or cache rows.
2. The slot engine is pure: no I/O, no DB, no `Date.now()` — current time is always a parameter.
3. All persisted times are UTC; timezone conversion only at the edge, using `event_type.timezone`.
4. Slot starts snap to the fixed grid in SLOT-ENGINE.md, never derived from an availability interval's start time.
5. Booking status transitions only via the BOOKING-FLOW.md state machine.
6. Capacity is enforced in a DB transaction (re-count active bookings inside the insert transaction), not application logic.
7. No PII beyond name + email; no interviewee analytics. Public API responses must never leak interviewer identities or counts.
8. Booking/invite tokens: 32+ bytes, URL-safe, single-purpose, stored hashed — custom, not Better Auth sessions.

## ⚠ Before reporting complete

Run after every code-change session; do not skip. A `Stop` hook also runs `pnpm run check` automatically, but run it yourself before claiming a task is done.

1. `pnpm run check` — Vite+ format/lint + workspace typecheck. Must be green.
2. For engine changes (Phase 1+): the `packages/engine` test suite must be green — it is the regression contract.

**Runtime testing is the developer's job.** Do not start the dev server or drive a browser to smoke-test. `tsc`/`pnpm run check` and the mandated engine + state-machine unit tests are the agent's verification surface; hand the developer numbered manual steps for anything requiring the running app.

## Conventions

- British spelling in UI copy and docs (organise, colour, cancelled). Dates in UI: DD/MM/YYYY. Times: 24-hour.
- IDs: prefixed CUID2 (`@paralleldrive/cuid2`) via `createId(prefix)` from `@repo/db/lib/cuid` (e.g. `evt_…`, `book_…`); register new prefixes in `CUID_PREFIXES`. Better Auth tables keep their own generated text IDs. Booking/invite tokens (confirm/decline/manage/invite): 32+ bytes, URL-safe, single-purpose, stored hashed. Sessions and magic links are Better Auth's job — never both for the same flow.
- All data access from `apps/web` goes through the oRPC client; no direct DB access from the web app. Never hardcode secrets or base URLs — use `@repo/env`.

## Code style

- **Arrow functions only.** No `function` declarations.
- **No barrel files** (`index.ts` re-export hubs). Import from the source module directly.
- **Early returns / fail fast.** Check the negative case first and return early; never wrap the happy path in an `if`. When control flow branches on more than one condition, use explicit `if` branches with early returns — not chained ternaries or `??`/`||` cascades. (Null-safe access with `?.`/`??` on a single field is fine.)
- TypeScript strict; no `any`. Comments only when the _why_ is non-obvious.
- Follow the surrounding code's idiom, naming, and comment density.

## Working rules

- **YAGNI.** Build only what the current build-plan phase requires. No speculative abstractions, config options, or generalisation for hypothetical future needs.
- **Never use `git stash`.** If work needs to be set aside, commit to a branch instead.
- **Backend follows router → controller → service layering** in `packages/api`, with files named `<module>.controller.ts` and `<module>.service.ts` alongside `src/routers/<module>.ts`. Routers only declare procedures, validate input, and delegate; controllers orchestrate the request (auth checks, shaping responses); services hold the business logic and are the only layer that touches `packages/db`. No business logic in routers or in `apps/server`. (The scaffolded todo router predates this convention — don't imitate it; it gets replaced in Phase 0.)

## Testing contract

- The slot engine (`packages/engine`, created in Phase 1) gets exhaustive unit tests: DST transitions (test with `America/New_York` and `Europe/London` even though the default timezone is `Asia/Singapore`), buffers spanning midnight, overlapping availability rules, exceptions, capacity counting, grid snapping/edge-time dropping.
- The engine test suite is the regression contract. Later phases must run it green before merging. Changing engine behaviour requires changing `SLOT-ENGINE.md` first.
- Every booking state-machine transition has a test, including hold expiry and decline→reassign.

## Agent workflow

One session per phase. At session start: read this file + the spec docs for the phase. At session end: update `.claude/docs/BUILD-PLAN.md` phase status and record deviations in its deviation log (deviations must be written into the spec, not left implicit in code).

## Commands

Package manager is pnpm; tasks run through Vite+ (`vp`).

```bash
pnpm install
pnpm run dev            # all apps (web on :3001, API on :3000)
pnpm run dev:web        # web only
pnpm run dev:server     # server only
pnpm run build
pnpm run check          # vp format/lint checks + workspace typecheck
pnpm run check-types    # typecheck only
pnpm run lint           # vp lint
pnpm run format         # vp fmt
pnpm run db:push        # push Drizzle schema to Postgres (Neon)
pnpm run db:generate    # generate migrations
pnpm run db:migrate
pnpm run db:studio
pnpm run deploy         # Alchemy deploy to Cloudflare (packages/infra)
pnpm run destroy
```

Lint/format config is in `vite.config.ts` at the repo root (double quotes, semicolons). DB connection is configured via `apps/server/.env` / root `.env` (loaded by `@repo/env`).

## Architecture

pnpm workspace monorepo (`apps/*`, `packages/*`):

- **`apps/web`** — TanStack Start (React 19, SSR, file-based routes in `src/routes`; `routeTree.gen.ts` is generated, never edit). Talks to the server only through the oRPC client — no direct DB access.
- **`apps/server`** — Hono app on Cloudflare Workers (`src/index.ts`). Mounts Better Auth at `/api/auth/*`, the oRPC `RPCHandler` at `/rpc`, and an OpenAPI reference handler at `/api-reference`. CORS is locked to `CORS_ORIGIN`. This is a thin transport layer; business logic does not live here.
- **`packages/api`** — the actual API layer: oRPC routers (`src/routers/`), request context (`src/context.ts` — resolves the Better Auth session), and `publicProcedure` / `protectedProcedure` definitions. End-to-end types flow from here into the web app.
- **`packages/db`** — Drizzle ORM + PostgreSQL. Schema in `src/schema/` (`auth.ts` is Better Auth–generated via `npx @better-auth/cli generate`, never hand-edit). `createDb()` factory in `src/index.ts`; drizzle-kit commands run here.
- **`packages/auth`** — Better Auth instance factory (`createAuth()`), Drizzle adapter, email+password enabled. Admins use email+password; interviewers will use the magic-link plugin; interviewees get no auth (tokenised links only).
- **`packages/env`** — typed env access with per-runtime entrypoints: `@repo/env/server` (Cloudflare `cloudflare:workers` env), `@repo/env/web` (t3-env, `VITE_`-prefixed client vars), `cloudflare-local` for local dev.
- **`packages/ui`** — shared shadcn/ui primitives; import as `@repo/ui/components/<name>`. Design tokens in `src/styles/globals.css`. Add primitives with `npx shadcn@latest add <name> -c packages/ui` from the root.
- **`packages/infra`** — Alchemy IaC for Cloudflare deployment.
- **`apps/fumadocs`** — docs site (port 4000).

The slot engine mandated by the specs (`packages/engine` in spec terms) does not exist yet; when built it must be a pure package with exhaustive unit tests (DST in `America/New_York` and `Europe/London`, buffers spanning midnight, overlapping rules, capacity, grid snapping) — that suite is the regression contract for all later phases.

Request flow: web route → oRPC client → `apps/server` Hono → `packages/api` router (context carries session) → `packages/db`.

## External docs

- **Better Auth**: https://better-auth.com/llms.txt
- **oRPC**: https://orpc.unnoq.com/llms.txt
- **Drizzle ORM**: https://orm.drizzle.team/llms.txt
- **TanStack Start / Router**: https://tanstack.com/router/latest/llms.txt
- **Hono**: https://hono.dev/llms.txt
