# Research: Fertilizer MSME Manager

**Feature**: 001-fertilizer-msme | **Date**: 2026-10-07

All Technical Context unknowns resolved. Format: Decision / Rationale / Alternatives.

## R1 — SQLite driver

- **Decision**: `better-sqlite3` (synchronous API), one singleton connection with
  `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- **Rationale**: Battle-tested, fastest local SQLite binding; synchronous API makes
  transactions trivial (`db.exec('BEGIN') … COMMIT`) and matches single-user local load.
- **Alternatives**: `node:sqlite` (stdlib — rejected: still experimental-flagged on LTS Node
  and API churn risk for a "production-ready" deliverable); `libsql` (network-oriented, no
  need); Drizzle/Knex (ORM/query-builder — constitution forbids without amendment; hand SQL
  is less code for one schema).

## R2 — Mutation surface

- **Decision**: Next.js Server Actions only, each exported from `src/app/actions/*`, wrapped
  by a `withRole(role, fn)` guard and zod-parsed input.
- **Rationale**: Native platform feature (ladder rung 4) — replaces hand-rolled routing,
  parsing, and fetch plumbing; forms bind directly via `useActionState`.
- **Alternatives**: REST API routes (more boilerplate, invites a client API layer the
  constitution forbids); tRPC (dependency + abstraction for zero external consumers).

## R3 — Authentication & sessions

- **Decision**: `node:crypto` `scrypt` password hashing (per-user salt, N=16384) +
  HMAC-SHA256-signed session cookie (`uid.expires.signature`, HttpOnly, SameSite=Lax,
  Secure when served over HTTPS), 12-hour expiry, sliding on activity.
- **Rationale**: Zero dependencies, native crypto, fully adequate for a LAN/local MSME with
  ≤10 users; signing makes cookie tampering detectable; server-side session table allows
  revocation (sign-out, deactivation).
- **Alternatives**: NextAuth/better-auth (forbidden dependency class; OAuth flows useless
  offline); `iron-session` (fine but one signed-encrypted cookie can't be revoked server-side
  without a table anyway).

## R4 — Dashboard charts

- **Decision**: `recharts` (Line/Bar/Pie/Composed) rendered in client components fed by
  server-computed aggregates.
- **Rationale**: Requested visualizations; mature React-native API; aggregation stays in SQL
  so the client only draws.
- **Alternatives**: Hand-rolled SVG (more code, worse for same job); Chart.js/chartist
  (imperative mount lifecycle fights React); lazy static HTML tables (fails SC-003/product
  ask).

## R5 — DESIGN.md → Tailwind 4 mapping

- **Decision**: Tailwind CSS 4 CSS-first config: all DESIGN.md tokens declared as CSS custom
  properties in `@theme` in `globals.css` (`--color-canvas`, `--color-primary`, `--radius-xl:
  40px`, type scale, spacing), component recipes as small semantic classes (`.btn-primary`,
  `.card`, `.table`) in `@layer components`. Fonts: **Hanken Grotesk** (display, 700–800) +
  **Inter** (body) — the exact open-source substitutes DESIGN.md prescribes for ABC Ginto
  Nord/ggsans.
- **Rationale**: Native Tailwind 4 mechanism; one file owns the whole token system; recipes
  keep screens consistent with `docs/ui-ux-guide.md`.
- **Alternatives**: `tailwind.config.js` (v3 legacy); styled-components (runtime dep); a
  component library like shadcn (its default light-neutral look fights DESIGN.md — every
  piece would be re-skinned anyway).

## R6 — GST math & invoicing

- **Decision**: Small pure module `src/lib/gst.ts`: HSN-wise taxable value → rate split →
  CGST/SGST or IGST → per-line rounding to rupees → invoice round-off → amount in words
  (Indian numbering: lakh/crore). Money stored as **INTEGER paise** everywhere; quantities as
  REAL with unit labels. Invoice numbers: `PREFIX/YY-NNNN` allocated inside the insert
  transaction with `UNIQUE(financial_year, seq)` as backstop.
- **Rationale**: Fertilizer GST rates are a handful of slabs (0/5/12%); in-house math is ~60
  lines and testable; paise integers eliminate float drift; UNIQUE constraint guarantees no
  duplicate numbers even under concurrent saves.
- **Alternatives**: `js-money`/accounting libs (dependency for arithmetic we control);
  storing REAL rupees (drift risk on tax totals — the "flimsier" option rejected per ponytail
  rule); external e-invoice IRN (deferred, out of scope v1).

## R7 — Migrations & seed

- **Decision**: Plain numbered `.sql` files in `src/db/migrations/`, applied in order by a
  ~20-line runner comparing `PRAGMA user_version`; seed script inserts demo masters,
  6 months of transactions, two users (admin/operator).
- **Rationale**: Stdlib SQLite feature; no migration framework dependency; rerunnable idempotent
  seed for demo/walkthrough (SC-006).
- **Alternatives**: drizzle-kit/Prisma migrate (dependency + ORM lock-in); hand-altered schema
  (forbidden by constitution III).

## R8 — Testing strategy

- **Decision**: `node --test` for pure logic (gst, stock balance, yield, migration runner,
  session signing), executed with `tsx`; lint + `next build` gate every phase; quickstart
  manual E2E script for UI flows.
- **Rationale**: Ladder — Node's built-in runner, zero framework; logic is where bugs cost
  money (stock/GST).
- **Alternatives**: Vitest/Jest (dependency, marginal gain here); Playwright E2E (heavy
  install; revisit only if UI regressions recur — noted as ceiling in TRD).

## R9 — Concurrency & write serialization

- **Decision**: Single `better-sqlite3` connection in the Node process, WAL + busy_timeout,
  transactions around every multi-statement write; server actions are naturally serialized by
  the single process.
- **Rationale**: Correct-by-construction for one factory, ≤10 users; equals SC-002/SC-008.
- **Alternatives**: Connection pool (unnecessary for SQLite single-writer); outbox/queue
  (over-engineering).
- **Ceiling**: `ponytail: single-process write path — if the unit ever runs multiple server
  processes (HA/multi-instance), move to client-level connections + busy_timeout or Litestream
  streaming replicas; upgrade path documented in docs/trd.md §Concurrency`.

## R10 — Backup

- **Decision**: `scripts/backup.sh` using `sqlite3 .backup` (online-safe) to a timestamped
  file; documented daily cron/manual habit; DB file lives in `data/`.
- **Rationale**: Native SQLite tooling, zero deps, no partial-copy corruption risk.
- **Alternatives**: Filesystem copy of a WAL DB (unsafe without checkpoint — rejected);
  Litestream (dependency; overkill for v1).
