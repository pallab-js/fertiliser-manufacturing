# System Design & Architecture (SDA): Fertilizer MSME Manager

**Date**: 2026-10-07 | **Spec**: [specs/001-fertilizer-msme/spec.md](../specs/001-fertilizer-msme/spec.md) | **Constitution**: [.specify/memory/constitution.md](../.specify/memory/constitution.md)

## 1. Overview

A single-deployable web application for one fertilizer manufacturing MSME unit in India.
Browser clients (desktop/tablet on localhost or LAN) talk to one Next.js server process, which
owns a single SQLite file. No external services, no cloud dependency.

```
┌──────────── Browser (Chrome/Edge, ≥768px) ────────────┐
│  Server Components (reads)   Server Actions (writes)  │
└───────────────┬───────────────────────┬───────────────┘
                │  HTML/RSC             │  zod + role guard + tx
┌───────────────▼───────────────────────▼───────────────┐
│                Next.js 15 App (Node 24)               │
│  app/(auth)  app/(app) shell  app/actions  components │
│  lib: auth · guard · gst · stock        db: singleton │
└───────────────────────┬───────────────────────────────┘
                        │ better-sqlite3 (one connection, WAL)
┌───────────────────────▼───────────────────────────────┐
│              data/noter.db  (+ scripts/backup.sh)     │
└───────────────────────────────────────────────────────┘
```

## 2. Module map

| Module | Screens | Writes | Reads from |
|---|---|---|---|
| Auth | login | login/logout | user, session |
| Shell | sidebar, topbar | — | session, company_settings |
| Dashboard | KPI cards + 4 charts | — | aggregates over all modules |
| Masters | items, formulas, customers, suppliers | CRUD (archive) | own tables |
| Inventory | balances, movement list, record movement | stock_movement | items, ledger |
| Production | batches, batch detail, QC entry | batch, qc_test | formulas, items, ledger |
| Purchases | PO list/detail, receive | purchase_order(+lines), receipt | suppliers, items |
| Sales | orders, issue invoice, invoice print, payments | sales_order, invoice, payment | customers, batches, items |
| Admin | users, settings | user, company_settings | user |

Dependency direction: Masters → Inventory → Production/QC → Purchases/Sales → Dashboard.
Delivery phases follow this order (see [implementation plan](../specs/001-fertilizer-msme/plan.md)).

## 3. Key data flows

**Production batch (atomic)** — operator completes batch:
```
completeBatch(batch)
  BEGIN TX
    snapshot consumption → batch_consumption
    for each material: stock_movement(batch_out, -qty)   ── rejects if balance < 0
    stock_movement(batch_in, +actual_qty) for finished good
    batch.status = 'completed'
  COMMIT                                  (spec FR-017, SC-008)
```

**Sales invoice (atomic)** — issue invoice:
```
issueInvoice(so)
  BEGIN TX
    validate QC-passed dispatchable stock ≥ lines   (FR-018/023)
    seq = next within fy; insert invoice + lines (snapshots)
    stock_movement(sale, -qty) per line
    sales_order.status = 'invoiced'
  COMMIT                                  (FR-025/026)
```

**Stock balance** — always `SUM(stock_movement.qty)` per item; ledger is append-only with
`balance_after` denormalized for audit; `npm run db:check` verifies consistency (SC-002).

**Dashboard** — server components run SQL aggregates (GROUP BY month) and pass plain data to
recharts client components; no client-side fetching of raw rows.

## 4. Rendering & navigation strategy

- Server Components by default; Client Components only for interactive islands (forms via
  `useActionState`, charts, modals, toasts).
- Route groups: `(auth)` public, `(app)` behind `requireUser()` middleware-style layout check.
- Role-gated routes: `/users`, `/settings` render 403 for operators (FR-003).

## 5. Deployment & operations

- Local: `npm run build && npm start` (or `npm run dev` during setup); data in `data/noter.db`.
- Backup: `scripts/backup.sh` (`sqlite3 .backup`, online-safe) → `data/backups/`.
- Update flow: pull → `npm ci` → `npm run db:migrate` → restart.
- Remote git: repository remote attached later; no runtime dependency on git.

## 6. Quality attributes

| Attribute | Approach |
|---|---|
| Correctness | Single tx per flow; DB CHECK/FK constraints as last line; `db:check` |
| Security | See [docs/security.md](./security.md) |
| Performance | SQL-side aggregation, indexed ledger lookups; ≤50k rows/screen |
| Usability | [docs/ui-ux-guide.md](./ui-ux-guide.md); empty states, toasts, field errors |
| Evolvability | Versioned SQL migrations; module-per-directory; constitution gates |

## 7. Known ceilings

- `ponytail: single-process, single-DB-connection architecture — adequate for ≤10 users on
  one machine/LAN. Upgrade path: multi-instance needs client-level connections + busy_timeout,
  or Litestream for HA reads; revisit if the unit ever deploys more than one server process.`
- `ponytail: no full audit trail on master edits — add audit_log table if compliance (FCO
  record-keeping) later requires change history.`
