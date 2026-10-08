# Quickstart & Validation Guide

**Feature**: 001-fertilizer-msme | **Date**: 2026-10-07

## Prerequisites

- Node.js 24 LTS + npm
- No cloud services, no DB server (SQLite file only)

## Setup

```bash
npm install
npm run db:migrate      # applies src/db/migrations in order (PRAGMA user_version)
npm run db:seed         # demo masters + 6 months of transactions + admin/operator users
npm run dev             # http://localhost:3000
```

Seeded logins (from seed): `admin/admin123` and `operator/operator123` — flagged for change
before real use (documented in README).

## Test / build gates

```bash
npm run lint            # ESLint
npm run build           # next build must pass
npm test                # node --test: gst math, stock logic, yield, session signing, migrations
npm run db:check        # consistency check: balance_after == SUM(qty) per item (SC-002)
```

## Validation scenarios (map to spec)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| V1 | Auth & roles (US1, SC-005) | Anonymous → `/dashboard`; login operator → `/users`; login admin → `/users` | Redirect to login; 403; page loads |
| V2 | Dashboard (US2, SC-003) | Login admin, open Dashboard, switch period | KPIs + 4 charts render <2s; cards link to modules |
| V3 | Negative stock blocked (FR-013) | Inventory → record issue > balance | Field error, balance unchanged |
| V4 | Batch flow (US4) | Start batch from formula → complete with actuals → record QC pass | Yield shown; raw down/finished up atomically; QC pass |
| V5 | QC gate (FR-018) | Sales line with failed-batch output | Batch not selectable / blocked with message |
| V6 | Partial receipt (FR-020) | PO 20 MT → receive 12 MT → try over-receive | Stock +12; PO partial; over-receive rejected |
| V7 | GST invoice (US6, SC-004) | Intra-state order → issue invoice → print | CGST/SGST correct, round-off balances, print layout clean, stock decremented |
| V8 | Interstate (FR-024) | Customer in another state | IGST instead of CGST/SGST |
| V9 | Payments (FR-028) | Record partial payment | Invoice status partial; receivable drops |
| V10 | Consistency (SC-002) | `npm run db:check` after V3–V9 | Zero discrepancies |
| V11 | Failure rollback (SC-008) | Kill save mid-transaction (test) | No partial rows; error toast; retry works |

## Backup

```bash
./scripts/backup.sh     # sqlite3 .backup → data/backups/noter-YYYYMMDD-HHMMSS.db
```
