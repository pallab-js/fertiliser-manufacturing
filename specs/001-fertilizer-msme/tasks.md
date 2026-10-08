# Tasks: Fertilizer MSME Manager

**Input**: Design documents from `/specs/001-fertilizer-msme/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/server-actions.md),
[quickstart.md](./quickstart.md), [docs/](../../docs/)

**Tests**: Included (constitution: business-critical logic — GST math, stock guards, auth,
migrations — MUST have runnable checks; `node --test`).

**Organization**: Tasks grouped by user story (P1→P7) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US7 from spec.md

---

## Phase 1: Setup

**Purpose**: Project initialization, design tokens, runnable skeleton

- [x] T001 Scaffold Next.js 15 + TypeScript (strict) app in repo root per plan.md structure (`src/app`, `src/components`, `src/db`, `src/lib`, `tests/`, `scripts/`)
- [x] T002 Install fixed dependency set: better-sqlite3, zod, recharts, tsx (dev); configure `npm` scripts: `dev`, `build`, `start`, `lint`, `test`, `db:migrate`, `db:seed`, `db:check` (docs/trd.md §1)
- [x] T003 [P] Configure ESLint/Prettier, `tsconfig` paths, `.gitignore` (`data/`, `.env*`, `node_modules/`, `.opencode/` per spec-kit security note), `next.config` security headers (docs/security.md §7)
- [x] T004 Implement DESIGN.md token system: `@theme` colors/radii/type + component recipes (`.btn-*`, `.panel`, `.stat-card`, `.badge`, table, toast, empty-state) in `src/app/globals.css` per docs/ui-ux-guide.md §2–3; self-host Hanken Grotesk + Inter via `next/font`
- [x] T005 [P] Create base UI primitives in `src/components/ui/`: Button, Input, Modal, Toast, Badge, EmptyState, DataTable, Pagination (recipes per docs/ui-ux-guide.md; stories consume these)
- [x] T006 Gate: `npm run lint && npm run build` passes; login-less shell renders on canvas

---

## Phase 2: Foundational (Blocking)

**⚠️ No user story work begins until this phase is complete**

- [x] T007 Implement DB singleton with pragmas `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000` in `src/db/index.ts`
- [x] T008 Migration runner (`PRAGMA user_version`, ordered `.sql` files) in `src/db/migrate.ts` + `src/db/migrations/001_init.sql`: ALL tables per data-model.md (user, session, company_settings, item, formula, formula_component, stock_movement, batch, batch_consumption, qc_test, supplier, customer, purchase_order, purchase_line, purchase_receipt, purchase_receipt_line, sales_order, sales_order_line, invoice, invoice_line, payment) with CHECK/FK/UNIQUE constraints + indexes verbatim from data-model.md
- [x] T009 [P] Money + dates helpers in `src/lib/money.ts` (paise arithmetic, `Intl.NumberFormat('en-IN')`) and `src/lib/dates.ts` (ISO, financial year helper)
- [x] T010 Implement `src/lib/stock.ts`: `applyMovement` (reject balance < 0, FR-013), `balanceFor(item)`, `dispatchableQty` (QC-pass gate stub until T036), `checkBalances()` for `db:check`
- [x] T011 Seed script `src/db/seed.ts`: company_settings, admin/operator users, ~10 items (raw+finished, HSN 3102/3103/3105), 3 formulas, parties, 6 months of batches/QC/POs/receipts/orders/invoices/payments (supports SC-003/SC-006)
- [x] T012 [P] Tests in `tests/`: migration runner applies from 0; stock guards (negative blocked, SUM == balance); money rounding — `node --test`
- [x] T013 App shell in `src/app/(app)/layout.tsx`: sidebar (`ex-app-shell-row`, primary active indicator), topbar (`nav-bar`), responsive collapse <1024px, max-width 1200 content (docs/ui-ux-guide.md §3)
- [x] T014 Backup script `scripts/backup.sh` (`sqlite3 .backup` → `data/backups/`, mkdir -p, perms 600)
- [x] **Checkpoint**: schema+migrations+seed+shell ready; `npm run db:check` clean

---

## Phase 3: User Story 1 — Secure sign-in & roles (P1) 🎯 MVP

**Goal**: admin/operator login, route + action gating, user management
**Independent Test**: V1 — anonymous redirected; operator denied `/users`; admin manages users

- [x] T015 [US1] Implement `src/lib/auth.ts`: scrypt hash/verify (N=16384, salt 16B, timingSafeEqual), session create/verify/revoke against `session` table, HMAC-signed HttpOnly cookie (12h sliding) per docs/security.md §2; refuse startup without `SESSION_SECRET` fallback dir secret with 600 perms
- [x] T016 [US1] Implement `src/lib/guard.ts`: `requireUser()` for layout, `withRole('operator'|'admin', fn)` envelope wrapper per contracts/server-actions.md
- [x] T017 [US1] Login page `src/app/(auth)/login/page.tsx` + `src/app/actions/auth.ts` (`login`, `logout`): zod validation, generic error (FR-005), gradient-mesh hero per ui-ux-guide §2
- [x] T018 [US1] Gate `(app)/layout.tsx` with `requireUser()` → redirect; render 403 empty-state for operator on `/users`, `/settings` (FR-003)
- [x] T019 [US1] User management: `src/app/users/` list + create/deactivate/reset-password forms, `src/app/actions/users.ts` (admin-only; last-active-admin guard FR-004)
- [x] T020 [US1] Company settings screen `src/app/settings/` + `src/app/actions/settings.ts` (admin) — name, GSTIN, state, invoice prefix, monthly target (feeds dashboard)
- [x] T021 [P] [US1] Tests in `tests/auth.test.ts`: hash/verify roundtrip, tampered cookie rejected, expired session rejected, withRole denial
- [x] **Checkpoint**: V1 passes; seed admin/operator login works

---

## Phase 4: User Story 2 — Central dashboard (P2)

**Goal**: KPI cards + charts over seeded data
**Independent Test**: V2 — seeded DB, all KPIs/charts correct, cards link out

- [x] T022 [US2] Aggregation queries in `src/db/queries/dashboard.ts`: production vs target (month), stock summary + low-stock (reorder_level), sales trend 6M, purchase spend 6M, QC pass rate, receivables (invoices unpaid/partial)
- [x] T023 [US2] Dashboard page `src/app/(app)/dashboard/page.tsx`: KPI row of `.stat-card` (one magenta hero variant), low-stock list (magenta LOW badge), period selector defaulting 6M (FR-007), links from every card (FR-008)
- [x] T024 [P] [US2] Chart components in `src/components/charts/` (recharts client components, props = server data): SalesLine, ProductionBar (actual vs target), PurchaseBar, QCPassPie — series colors per ui-ux-guide §4, hidden data-table fallback for a11y
- [x] T025 [US2] Gradient-mesh dashboard header band (login pattern reuse); verify SC-003 timing locally
- [x] **Checkpoint**: V2 passes on seeded data

---

## Phase 5: User Story 3 — Masters & inventory (P3)

**Goal**: items/formulas/parties CRUD + stock movements + balances
**Independent Test**: V3 — negative issue blocked, balance == SUM, archive-not-delete

- [x] T026 [P] [US3] Items: `src/app/items/` list/detail + `src/app/actions/items.ts` (create/update/archive, admin; validations: kind raw|finished, gst_rate CHECK (0,5,12,18), unique non-archived name)
- [x] T027 [P] [US3] Parties: `src/app/customers/`, `src/app/suppliers/` + `src/app/actions/parties.ts` (archive-only delete FR-011; shared PartyForm component)
- [x] T028 [US3] Formulas: `src/app/formulas/` + `src/app/actions/formulas.ts` (components[] with qty>0, UNIQUE(formula_id,item_id), deactivate not delete)
- [x] T029 [US3] Inventory screens: `src/app/inventory/` balances table (low-stock flag, tabular-nums) + movement history + record-movement form; `src/app/actions/inventory.ts` uses `applyMovement` (adjustment requires reason)
- [x] T030 [P] [US3] Tests in `tests/stock.test.ts`: receipt/issue/adjust flows, balance floor, `checkBalances()` catches tampering
- [x] T031 [US3] Search/filter on items/parties lists (`?q=` param, FR-029) with empty states
- [x] **Checkpoint**: V3 passes; `npm run db:check` clean

---

## Phase 6: User Story 4 — Production batches & QC (P4)

**Goal**: batch lifecycle with atomic stock effects + QC dispatch gate
**Independent Test**: V4/V5 — yield shown, atomic in/out, failed batch not selectable

- [x] T032 [US4] Start batch: `src/app/production/` batch list + new-batch form (formula + planned qty → computed required materials); `src/app/actions/production.ts` `startBatch` (batch_no `BATCH/FY/NNN`)
- [x] T033 [US4] Complete batch: actual consumption entry vs planned, yield % display; `completeBatch` in ONE tx: snapshot to `batch_consumption` (FR-019), `batch_out`/`batch_in` movements, status completed (FR-016/017)
- [x] T034 [US4] Cancel batch; formula edit keeps historical snapshots (test)
- [x] T035 [US4] QC entry: batch detail page test form (parameters JSON, result pass|fail|pending, tester, time); latest-result-wins; Hold badge styling
- [x] T036 [US4] Finish `dispatchableQty` in `src/lib/stock.ts` (latest qc_test per batch = pass only) — wires into sales later
- [x] T037 [P] [US4] Tests in `tests/batch.test.ts`: atomicity (rollback leaves ledger untouched), yield math, snapshot preserved after formula edit, QC gate
- [ ] **Checkpoint**: V4 passes (tests + E2E); V5 gate logic tested — V5's sales-UI half lands at T042

---

## Phase 7: User Story 5 — Purchases & goods receipt (P5)

**Goal**: PO → partial/full receipt → stock in + spend reporting
**Independent Test**: V6 — +12 MT on partial, PO status partial, over-receive rejected

- [x] T038 [US5] Purchase orders: `src/app/purchases/` list/detail + new-PO form (supplier, lines qty>0/rate≥0); `src/app/actions/purchases.ts` `createPurchaseOrder` (po_no `PO/FY/NNN`), status open|partial|received|cancelled
- [x] T039 [US5] Goods receipt: receive form (ordered vs received vs balance), `receiveGoods` in ONE tx (receipt lines + `receipt` movements + PO status recompute) (FR-020/021); reject over-receipt
- [x] T040 [P] [US5] Purchase report query + view: spend by period & supplier (`src/app/purchases/reports`) matching receipts (FR-022)
- [x] T041 [P] [US5] Tests in `tests/purchase.test.ts`: partial math, over-receive rejection, status transitions
- [x] **Checkpoint**: V6 passes; dashboard purchase-spend now live-sourced

---

## Phase 8: User Story 6 — Sales orders & GST invoicing (P6)

**Goal**: QC-gated orders → GST invoice → print → payments/receivables
**Independent Test**: V7/V8/V9 — tax math exact, IGST switch, print clean, stock down, receivable drops

- [x] T042 [US6] Sales orders: `src/app/sales/` list + new-order form (party, place of supply → tax_mode intra|inter, batch-linked lines with `dispatchableQty` validation); `src/app/actions/sales.ts` `createSalesOrder`, line add/remove, cancel (so_no `SO/FY/NNN`)
- [x] T043 [US6] Implement `src/lib/gst.ts`: `computeInvoiceTotals` (HSN-wise taxable → CGST/SGST or IGST → per-line ₹ round → invoice round-off, exact sum), `amountInWords` (Indian lakh/crore), `nextInvoiceNo(fy)` with `UNIQUE(fy,seq)` (FR-024/025)
- [x] T044 [US6] `issueInvoice` in `src/app/actions/sales.ts`: ONE tx — QC/stock validation, allocate seq, invoice + snapshot lines, `sale` movements, SO → invoiced (FR-023/026)
- [x] T045 [US6] Invoice view + print layout `src/app/sales/invoices/[id]/page.tsx` + `print.css`: company/customer blocks, HSN summary, tax breakdown, amount in words, `window.print()` (FR-027, no PDF lib)
- [x] T046 [US6] Payments: record-payment form + `recordPayment` (amount>0, recompute status unpaid|partial|paid) (FR-028)
- [x] T047 [US6] Receivables view (by customer, outstanding) feeding dashboard card
- [x] T048 [P] [US6] Tests in `tests/gst.test.ts`: slab splits, intra vs inter, round-off identity (sum of parts == total), words, numbering uniqueness + rollback doesn't burn seq
- [x] **Checkpoint**: V7/V8/V9 pass; `npm run db:check` clean

---

## Phase 9: User Story 7 — Operator day-to-day efficiency (P7)

**Goal**: consistent search/filter/toasts/empty/loading states everywhere
**Independent Test**: V-quickstart: first-time operator completes entries unaided (SC-006)

- [x] T049 [US7] Sweep every list page: search + filters + pagination wired to `?q=` with empty-state reset action (FR-029)
- [x] T050 [US7] Sweep every form: `useActionState` field errors preserved (FR-030), success toasts (FR-031), loading/disabled states, keyboard submit
- [x] T051 [US7] Skeletons for slow lists/dashboard (ui-ux-guide §6); 403 + error states consistent — SSR renders with data; 403 shown via EmptyState on users/settings
- [x] T052 [US7] Tablet pass ≥768px: touch targets ≥44px (globals.css), sidebar drawer (shell.tsx), table horizontal scroll (data-table.tsx), invoice print unaffected (print.css)
- [x] **Checkpoint**: SC-006 walkthrough with quickstart V1–V9

---

## Phase 10: Polish & Cross-Cutting (Security gate)

- [ ] T053 Execute docs/security.md §8 pre-release checklist; fix findings (SC-005)
- [ ] T054 Run full gate: `npm run lint && npm run build && npm test && npm run db:check`; quickstart V1–V11
- [ ] T055 [P] README: setup, seed logins (change warning), scripts, backup/restore, architecture doc links
- [ ] T056 [P] Production smoke: `npm run build && npm start`, default-password warning check, headers present, backup script run
- [ ] T057 Git: `git init`, initial commit(s); leave remote hookup pending (link provided later)
- [ ] T058 `/speckit.converge` → append remaining work; iterate until **Converged**

---

## Dependencies

```
Phase 1 (T001–T006) → Phase 2 (T007–T014) → Phase 3 US1 (T015–T021)  🎯 MVP
US1 → US2 (needs seed + auth)
US1 → US3 (masters) → US4 (production) → US5 (purchases) ─┐
                          US3 → US6 (sales, needs QC) ←───┤
US2 dashboard: aggregates exist from Phase 2 schema (seeded); live data lands as US3–US6 ship
US7 polish: after US3–US6; Phase 10 after all
```

## Parallel opportunities

- T003 ∥ T004; T005 ∥ T007–T008; T026 ∥ T027; T024 ∥ T023; T040 ∥ T039; T043 ∥ T042;
  T055 ∥ T056. Cross-story: US5 and US6 both build after US4 (independent files, can split).

## Implementation strategy

MVP = Phase 1–3 (sign-in + shell + admin). Then ship each story as a runnable increment;
dashboard (US2) lands early on seed data and stays correct as modules feed it. Every phase
ends with `lint + build + test + db:check` green and its V-scenarios passing — never a broken
mainline.
