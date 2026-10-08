# Implementation Plan: Fertilizer MSME Manager

**Branch**: `001-fertilizer-msme` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-fertilizer-msme/spec.md`

## Summary

Build a single-unit factory management web app for an Indian fertilizer MSME: masters,
inventory, production batches with QC, purchases, sales with GST invoicing, and a central
analytics dashboard, behind admin/operator auth. Technical approach: Next.js App Router +
TypeScript + Tailwind CSS 4 on the frontend/server, SQLite (`better-sqlite3`) as the single
local datastore with versioned SQL migrations, server actions as the only mutation surface
(zod-validated, role-checked), and recharts for dashboard visualizations. All UI implements
`docs/ui-ux-guide.md`, which is derived strictly from `DESIGN.md`.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS

**Primary Dependencies**: Next.js 15 (App Router, Server Actions), React 19, Tailwind CSS 4,
zod, recharts, better-sqlite3. Fonts: Hanken Grotesk + Inter (open-source substitutes named in
DESIGN.md). No ORM, no auth library, no PDF library (constitution: Technology Constraints).

**Storage**: SQLite single file (`data/noter.db`) via `better-sqlite3`, WAL mode, foreign keys
ON, versioned `.sql` migrations driven by `PRAGMA user_version`.

**Testing**: Node built-in test runner (`node --test`) for logic-level checks (stock math, GST
calc, yield, auth/session helpers); `npm run build` + `npm run lint` as phase gates; manual
E2E walk-through per [quickstart.md](./quickstart.md).

**Target Platform**: Local desktop/LAN deployment, browsers at ≥768px (desktop + tablet),
Node 24 server.

**Project Type**: Web application (single Next.js project)

**Performance Goals**: Dashboard renders within 2s locally with 6 months of seed data (SC-003);
list pages respond instantly at ≤50k rows (local SQLite is far above this need).

**Constraints**: Single SQLite file — writes serialized through one connection; no external
services; invoices via HTML + browser print; Indian GST money math in INR with 2-decimal
precision.

**Scale/Scope**: 1 factory, ≤10 users (2 roles), ~14 entities, ~12 screens, 7 delivery phases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate (constitution) | Status | Evidence |
|---|---|---|---|
| I | DESIGN.md is law — all UI from DESIGN.md tokens | PASS | `docs/ui-ux-guide.md` maps every token/component to DESIGN.md; `ex-*` app-chrome examples drive shell/table/modal/toast |
| II | Minimum viable code (YAGNI ladder, `ponytail:` on known ceilings) | PASS | No ORM/auth-lib/PDF-lib; server actions over API routes; raw SQL over query builder; ceilings marked (e.g., single-connection write serialization) |
| III | Data integrity — transactions, DB constraints, versioned migrations | PASS | All multi-write flows (batch, invoice) single transaction; CHECK/FK constraints in schema; `PRAGMA user_version` migrations only |
| IV | Security at boundaries — zod, role checks, scrypt, signed cookies, prepared statements | PASS | Enforced pattern documented in `docs/security.md` + TRD; every server action has validation + role guard |
| V | Spec-driven phase gates — artifacts before code, converge before done | PASS | This plan + tasks per phase; `/speckit.converge` at each phase end |
| — | Fixed stack, no forbidden deps | PASS | Dependencies listed above are exactly the allowed set |

**Post-design re-check (after Phase 1)**: PASS — data model and contracts introduce no
violations; single-DB single-connection serialization recorded as a `ponytail:` ceiling in
TRD rather than an ignored constraint.

## Project Structure

### Documentation (this feature)

```text
specs/001-fertilizer-msme/
├── plan.md              # This file
├── spec.md              # PRD (/speckit.specify output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (server-action contracts)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

Project-level docs (repo root `docs/`):

```text
docs/
├── architecture.md      # SDA: module map, data flow, C4-lite
├── trd.md               # Technical requirements: stack, schema, conventions
├── ui-ux-guide.md       # DESIGN.md → Tailwind 4 tokens + app-chrome recipes
└── security.md          # Threat model, auth, validation, backup
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/login/            # Sign-in page (public)
│   ├── (app)/                   # Authenticated shell
│   │   ├── dashboard/
│   │   ├── items/  formulas/  customers/  suppliers/   # Masters
│   │   ├── inventory/           # Balances + movements
│   │   ├── production/          # Batches + QC
│   │   ├── purchases/           # POs + receipts
│   │   ├── sales/               # Orders + invoices + payments
│   │   ├── users/  settings/    # Admin only
│   │   └── layout.tsx           # Sidebar shell (ex-app-shell-row)
│   ├── actions/                 # Server actions (zod + role guard)
│   └── layout.tsx
├── components/                  # UI kit per ui-ux-guide (table, modal, toast, cards…)
├── db/
│   ├── index.ts                 # better-sqlite3 singleton, pragmas
│   ├── migrate.ts               # PRAGMA user_version runner
│   ├── migrations/              # 001_init.sql, 002_*.sql…
│   └── seed.ts                  # Demo data
├── lib/
│   ├── auth.ts                  # scrypt + HMAC session cookie
│   ├── guard.ts                 # requireUser()/requireAdmin() for actions
│   ├── gst.ts                   # tax math, invoice numbering, amount in words
│   └── stock.ts                 # Balance/consistency logic
tests/                           # node --test logic tests
scripts/backup.sh                # SQLite backup (sqlite3 .backup)
DESIGN.md  docs/  specs/  .specify/
```

**Structure Decision**: Single Next.js project (Option 1 web-app layout adapted to App
Router). Server actions in `src/app/actions/` are the only mutation surface; reads happen in
server components via `src/db/`. No separate backend — constitution forbids API-client
abstractions over internal calls, and one deployable keeps the MSME deployment trivial
(`npm start` + one SQLite file).

## Complexity Tracking

> No Constitution Check violations to justify — table intentionally empty.
