# Technical Requirements Document (TRD): Fertilizer MSME Manager

**Date**: 2026-10-07 | **Companion**: [architecture.md](./architecture.md) · [security.md](./security.md) · [ui-ux-guide.md](./ui-ux-guide.md)

## 1. Stack (fixed by constitution)

| Layer | Choice | Version/channel |
|---|---|---|
| Framework | Next.js App Router + React | 15.x |
| Language | TypeScript (strict) | 5.x |
| Styling | Tailwind CSS 4 (CSS-first `@theme`) | 4.x |
| DB | SQLite via `better-sqlite3` | latest stable |
| Validation | zod | 3.x |
| Charts | recharts | 2.x |
| Fonts | Hanken Grotesk (display) + Inter (body) | self-hosted via `next/font` |
| Test | `node --test` + `tsx` | built-in |
| Lint/format | ESLint (`eslint .`) — Prettier deliberately skipped (YAGNI; constitution) | — |

Forbidden without constitutional amendment: ORM, auth library, PDF library, internal API-client
layer, component kit re-skins (shadcn etc.).

## 2. Project layout

```
src/
├── app/
│   ├── (auth)/login/
│   ├── (app)/{dashboard,items,formulas,customers,suppliers,
│   │         inventory,production,purchases,sales,users,settings}/
│   ├── actions/            # one file per module: items.ts, inventory.ts, sales.ts…
│   └── layout.tsx
├── components/             # ui/ (primitives), shell/ (sidebar/topbar), charts/
├── db/                     # index.ts, migrate.ts, migrations/*.sql, seed.ts, check.ts
├── lib/                    # auth.ts, guard.ts, gst.ts, stock.ts, money.ts, dates.ts
tests/                      # *.test.ts (node --test)
scripts/backup.sh
data/                       # noter.db, backups/  (gitignored)
```

## 3. Data layer rules

- **One singleton** `Database` in `src/db/index.ts`: `journal_mode=WAL`,
  `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.
- **Migrations**: `src/db/migrations/NNN_name.sql`, applied in order, tracked by
  `PRAGMA user_version`. Never edit an applied migration — add a new one.
- **Schema types**: money `INTEGER` paise; quantities `REAL`; timestamps ISO-8601 TEXT;
  enums via CHECK constraints; archive flags over deletes; `created_at`/`created_by` on all
  transactional tables. Full schema: [data-model.md](../specs/001-fertilizer-msme/data-model.md).
- **Transactions**: `db.exec('BEGIN') … COMMIT/ROLLBACK` around every multi-statement write;
  never interleave unrelated writes in one tx.
- **SQL**: always prepared statements (`.get/.all/.run` with `?` params). String-built SQL is
  forbidden (constitution IV); dynamic filters use whitelisted column tokens only.

## 4. Server action conventions

```ts
// src/app/actions/sales.ts
export const issueInvoice = withRole('operator', async (soId: number) => {
  const parsed = issueInvoiceSchema.parse({ soId });   // zod at boundary
  // … single transaction …
  return { ok: true, data: { invoiceNo }, toast: 'Invoice issued' } as const;
});
```

- Envelope, guard, validation: [contracts/server-actions.md](../specs/001-fertilizer-msme/contracts/server-actions.md).
- Errors: expected failures return `{ ok:false, fieldErrors }`; bugs throw and surface a
  generic retry toast — never leak stack traces to the UI.
- Revalidation: `revalidatePath` for the affected list after successful writes.

## 5. Core algorithms (pure, unit-tested)

| Module | Rules |
|---|---|
| `lib/money.ts` | paise ↔ ₹ formatting (`Intl.NumberFormat('en-IN')`), integer add/sub only |
| `lib/gst.ts` | HSN-wise taxable → rate split → CGST/SGST (intra) or IGST (inter) → per-line round to ₹ → invoice round-off on total; `amountInWords` Indian numbering; `nextInvoiceNo(fy)` inside tx with `UNIQUE(fy,seq)` backstop |
| `lib/stock.ts` | `applyMovement` rejects balance < 0 (except explicit adjustment flows that must still stay ≥ 0); `dispatchableQty` = stock from batches whose latest QC = pass; consistency `checkBalances()` |
| `lib/auth.ts` | scrypt (N=16384, r=8, p=1, 16-byte salt, 64-byte key), `timingSafeEqual`; cookie `base64url(payload).hmac`, 12h sliding expiry, server-side `session` row for revocation |
| Yield | `actual_qty / planned_qty × 100` (guard planned_qty = 0 → n/a) |

## 6. Concurrency

Single process, single connection; server actions serialized by the event loop; WAL keeps
readers non-blocking. Failures on `SQLITE_BUSY` retry once after `busy_timeout`.
`ponytail: single-process write path — upgrade to client-level connections or Litestream if
multi-instance deployment ever happens (see architecture §7).`

## 7. Testing & quality gates

- **Unit** (`node --test`): gst totals & round-off, amount-in-words, stock guards &
  consistency, yield, invoice numbering, session sign/verify, migration runner.
- **Integration** (same runner against a temp DB): batch completion tx, invoice tx rollback
  (SC-008), partial receipt math.
- **Phase gates**: `npm run lint && npm run build && npm test` before any phase demo.
- **E2E**: manual script [quickstart.md](../specs/001-fertilizer-msme/quickstart.md) V1–V11.
  `ponytail: no Playwright in v1 — add if UI regressions slip through review twice.`

## 8. Performance & capacity

- Dashboard aggregates SQL-side with month GROUP BY, indexes per data-model §Indexes;
  target: <2s with 6 months seed (SC-003) — comfortable for SQLite at this scale.
- Lists paginate (50/page) with indexed search on name/number; ≤50k rows per screen.
- No caching layer needed (single user sessions, fresh reads = correct data).

## 9. Error handling & observability

- Console structured logs on server: action name, user, duration, error — no PII beyond
  username; logs to stdout (systemd/terminal captures).
- UI: field-level errors (form stays filled), toast on success (FR-031), retryable error
  banner on tx failures with zero partial writes (SC-008).
