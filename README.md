# Fertilizer MSME Manager

Production, inventory, QC, purchases and GST invoicing for a fertilizer manufacturing unit.

## Stack

- **Next.js 16.4** (App Router, Turbopack, server actions only — no API routes)
- **React 19.3** + **TypeScript 5** (strict)
- **Tailwind 4** — Discord design language (dark theme, mesh gradients)
- **SQLite** (better-sqlite3, WAL, single file `data/noter.db`)
- **zod** for validation, **recharts 3** for charts
- **scrypt** (N=16384) + HMAC-signed HttpOnly cookie auth
- Tests: `node --test` via `tsx` (44 tests, all business logic)

## Quick start

```bash
# install deps
npm ci

# migrate + seed (creates data/noter.db with demo data)
npm run db:migrate && npm run db:seed

# dev server
npm run dev

# production build + start
npm run build && npm start
```

Open http://localhost:3000 (or the port shown).

### Default credentials (change before real use!)

| Role | Username | Password |
|------|----------|----------|
| admin | admin | admin123 |
| operator | operator | operator123 |

> **⚠️** The seed uses these exact passwords. Run `npm run db:seed` again after changing them in the Users screen, or update the seed script.

## NPM scripts

| Script | Purpose |
|--------|---------|
| `dev` | Next.js dev server (Turbopack) |
| `build` | Production build |
| `start` | Production server |
| `lint` | ESLint (strict) |
| `test` | All unit/integration tests (`node --test`) |
| `db:migrate` | Run migrations from `src/db/migrations/` |
| `db:seed` | Seed demo data (users, items, formulas, parties, 6 months of batches/POs/invoices) |
| `db:check` | Verify ledger integrity (`stock_movement` balances match `balance_after`) |
| `db:reset` | Delete DB, migrate, seed (dev convenience) |

## Architecture

```
src/
├── app/
│   ├── (auth)/login          # login page + auth actions
│   ├── (app)/                # authenticated shell
│   │   ├── dashboard         # KPIs + charts (production, sales, purchases, QC, stock)
│   │   ├── items             # raw/finished goods masters
│   │   ├── formulas          # BOMs with component lines
│   │   ├── customers         # party master (archive-only delete)
│   │   ├── suppliers         # party master
│   │   ├── inventory         # stock balances + movement history + manual adjustments
│   │   ├── production        # batch lifecycle (start → consume → complete → QC)
│   │   ├── purchases         # PO → receipt (partial/full) + spend reports
│   │   ├── sales             # SO → GST invoice (intra/inter) + payments + receivables
│   │   ├── users             # admin: create/deactivate/reset users
│   │   └── settings          # admin: company, GSTIN, state, invoice prefix, target
├── components/
│   ├── ui/                   # primitives: Button, Input, Modal, Toast, Badge, DataTable, Pagination, SearchBar, charts
│   └── shell/                # responsive sidebar + topbar
├── lib/
│   ├── auth.ts               # scrypt hash/verify, session create/verify/revoke
│   ├── guard.ts              # requireUser(), withRole() for server actions
│   ├── money.ts              # paise arithmetic, Intl.NumberFormat('en-IN')
│   ├── dates.ts              # ISO, financial year (Apr–Mar), month keys
│   ├── stock.ts              # applyMovement, balanceFor, dispatchableQty (QC-gated), checkBalances
│   ├── gst.ts                # computeInvoiceTotals, amountInWords (lakh/crore), nextInvoiceNo
│   ├── batch.ts              # startBatch, completeBatchTx, cancelBatch, latestQc, yieldPct
│   ├── purchase.ts           # createPurchaseOrder, receiveGoods, cancelPurchaseOrder
│   └── sales.ts              # createSalesOrder, issueInvoice, recordPayment
├── db/
│   ├── index.ts              # singleton, WAL, FK, busy_timeout, inTx (savepoint nesting)
│   ├── migrate.ts            # PRAGMA user_version runner
│   ├── migrations/001_init.sql  # 21 tables, CHECK/FK/UNIQUE + indexes
│   ├── seed.ts               # comprehensive demo data
│   └── queries/              # dashboard, purchases, sales aggregations
└── tests/
    ├── helpers/env.ts        # isolated temp DB per test file
    ├── auth.test.ts
    ├── stock.test.ts
    ├── batch.test.ts
    ├── purchase.test.ts
    ├── gst.test.ts           # GST math, invoice numbering, words, rollback safety
    └── ...
```

## Key features

### Masters
- Items (raw/finished), formulas (BOMs with component lines), customers, suppliers
- Archive-only delete (FK-safe), search + pagination on all lists

### Inventory
- Real-time balances from `stock_movement` ledger (`applyMovement` with negative guard)
- Movement history per item, manual adjustments with required reason

### Production (QC-gated)
- Start batch → snapshot planned consumption (formula × planned qty) → complete with actuals + yield %
- Atomic `batch_out`/`batch_in` movements in one tx
- QC test (pass/fail/pending), latest-result-wins; only QC-passed batches are dispatchable

### Purchases
- PO with lines (qty>0, rate≥0), status open/partial/received/cancelled
- Goods receipt: over-receipt rejected, status recompute, price stored per receipt line
- Spend reports: by month & supplier (receipt lines only)

### Sales + GST Invoicing
- Sales order with place-of-supply → intra/inter tax mode
- DispatchableQty validation (QC-passed finished goods only)
- GST invoice: HSN-wise taxable → CGST/SGST (intra) or IGST (inter) → per-line ₹ round → invoice round-off (exact sum identity)
- Invoice numbers: `PREFIX/FY/NNNN` (UNIQUE per FY, rollback-safe seq)
- Print layout (HTML + `window.print()`, no PDF lib) with company/customer blocks, HSN summary, tax breakdown, amount in words (Indian lakh/crore)
- Payments → status unpaid/partial/paid, receivables per customer

### Dashboard
- KPI cards (production vs target, low stock, sales trend, purchase spend, QC pass rate, receivables)
- 6M period selector, all cards link to detail pages

### Security
- scrypt password hashing (N=16384, 16B salt, timingSafeEqual)
- HMAC-signed HttpOnly cookie, 12h sliding expiry, server-side revocation
- `withRole('operator'|'admin')` on every server action
- Route-level 403 for operator on admin pages
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, etc.
- Prepared statements only, zod at every action boundary
- WAL + single-tx flows + `db:check` ledger verification

## Development

```bash
# run all quality gates
npm run lint && npm test && npm run build && npm run db:check
```

### Adding a feature

1. Schema: edit `src/db/migrations/001_init.sql` (or new migration)
2. Lib: add pure functions in `src/lib/` (testable without Next.js)
3. Actions: thin `withRole` + zod wrapper in `src/app/actions/`
4. UI: server page + client components (`useActionState` + Toast)
5. Test: add `tests/*.test.ts` (import `./helpers/env` first)

## Backup / Restore

```bash
# backup (online-safe via sqlite3 .backup)
./scripts/backup.sh

# restore
# 1. stop server
# 2. cp data/backups/noter-<ts>.db data/noter.db
# 3. npm run db:migrate
# 4. start server
```

Backups are stored in `data/backups/` (gitignored, perms 600).

## License

Internal tool — not for distribution.