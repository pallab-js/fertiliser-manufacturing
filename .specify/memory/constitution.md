<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: N/A (initial ratification)
- Added sections: Core Principles (I–V), Technology Constraints, Development Workflow, Governance
- Removed sections: none
- Follow-up TODOs: none
-->
# Fertilizer MSME Manager Constitution

## Core Principles

### I. DESIGN.md Is Law

`DESIGN.md` at the repository root is the single source of truth for all UI/UX. Every color,
radius, spacing, typography, and component treatment MUST trace to a DESIGN.md token. The
indigo canvas, the Blurple/green/magenta chord, generous rounding, and the app-chrome examples
(`ex-app-shell-row`, `ex-data-table-cell`, `ex-modal-card`, `ex-toast`, `stat-card`) are
non-negotiable. When a surface is not covered by DESIGN.md, extend its token system — never
invent an off-token style, never introduce a fourth loud accent, never flatten the canvas to
neutral grey.

### II. Minimum Viable Code (YAGNI)

Every change MUST pass the ladder before code is written: does it need to exist at all; is it
already in this codebase; does the standard library or a native platform feature cover it; can
it be one line; only then the smallest working implementation. No unrequested abstractions, no
speculative scaffolding, no avoidable dependencies. Deliberate simplifications with a known
ceiling MUST carry a `ponytail:` comment naming the ceiling and the upgrade path. Deletion
beats addition.

### III. Data Integrity Above All

This system holds stock, production, and money records for a real factory. All multi-statement
writes MUST run inside a single SQLite transaction. Database constraints (NOT NULL, UNIQUE,
CHECK, FOREIGN KEY) MUST enforce invariants that the UI also enforces — the DB is the last
line of defense. Schema changes go through versioned `.sql` migration files only; ad-hoc
schema edits are forbidden. No flow may lose or double-count user data on failure.

### IV. Security at Every Boundary

Every server entry point (server action, route) MUST validate input with zod before touching
the database, and MUST check the caller's role (admin/operator) before mutating. Passwords are
hashed with `node:crypto` scrypt; sessions are HMAC-signed HttpOnly cookies; all SQL uses
prepared statements — string-concatenated SQL is forbidden. Secrets never ship in the client
bundle. Security-relevant rules live in `docs/security.md` and are verified before release.

### V. Spec-Driven, Phase-Gated Delivery

No implementation code for a phase begins until that phase's spec/plan/tasks artifacts exist
and are consistent. Work follows the spec-kit flow (constitution → specify → plan → tasks →
implement → converge); `/speckit.converge` MUST report Converged before a phase is called
done. Requirements changes flow back into the spec documents first, not just the code.

## Technology Constraints

- Runtime stack is fixed: Next.js (App Router) + TypeScript + Tailwind CSS 4 + SQLite via
  `better-sqlite3`, server actions for mutations, zod for validation, recharts for dashboard
  charts. Adding a dependency requires justifying it against the ladder (II) first.
- Forbidden without explicit amendment: ORMs, third-party auth libraries, PDF-generation
  libraries, API-client abstractions over internal calls. Invoices render as HTML with the
  browser print stylesheet.
- UI implements `docs/ui-ux-guide.md`, which is derived from `DESIGN.md`; the guide may not
  contradict DESIGN.md.

## Development Workflow

- Deliver in the agreed phases (0 docs → 7 hardening); each phase ends with a working,
  runnable app state — never a broken mainline.
- `npm run build` and `npm run lint` MUST pass before a phase is presented.
- Tests are targeted, not exhaustive: business-critical logic (stock movements, batch yield,
  GST math, auth/session) gets runnable checks; trivial UI glue does not.
- Every deliverable (code or doc) is reviewed against this constitution; violations are
  fixed before merge, not deferred.

## Governance

- This constitution supersedes ad-hoc preferences for this repository. Amendments are made by
  editing this file with a Sync Impact Report and a MAJOR/MINOR/PATCH version bump
  (MAJOR: principle removal/redefinition; MINOR: new or materially expanded principle;
  PATCH: clarification/wording).
- Compliance is reviewed at every `/speckit.converge` and at each phase gate.
- Runtime development guidance lives in `DESIGN.md` (UI/UX) and `docs/security.md` (security).

**Version**: 1.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
