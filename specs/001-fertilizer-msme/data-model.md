# Data Model: Fertilizer MSME Manager

**Feature**: 001-fertilizer-msme | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

Conventions: `id` INTEGER PK autoincrement unless noted; timestamps are ISO-8601 TEXT (UTC);
money is **INTEGER paise** (`*_paise`); quantities are REAL; every transactional table carries
`created_at`, `created_by`. Foreign keys ON (cascade restricted → archive pattern). State
fields are TEXT with CHECK constraints.

## Entity Relationship (summary)

```
user ──< stock_movement >── item                    item <── formula_component ── formula >── item
formula ──< batch >── qc_test                       batch ──< stock_movement (refs)
supplier ──< purchase_order ──< purchase_receipt >── item
customer ──< sales_order ──< sales_order_line >── batch
sales_order ──< invoice ──< invoice_line (snapshot) ──< payment
company_settings (singleton)
```

## Tables

### user
| field | type | notes |
|---|---|---|
| id, username | INTEGER PK, TEXT UNIQUE NOT NULL | login name, lowercased |
| password_hash | TEXT NOT NULL | scrypt: `salt$hash` |
| role | TEXT CHECK IN ('admin','operator') | FR-002 |
| active | INTEGER 0/1 DEFAULT 1 | deactivate, never delete (FR-004) |
| created_at, updated_at | TEXT | |

Validation: last active admin cannot be deactivated (app-level inside tx).

### session (server-side revocation)
| field | type | notes |
|---|---|---|
| id | TEXT PK | session id embedded in cookie |
| user_id | FK user, ON DELETE CASCADE | |
| expires_at | TEXT | 12h sliding (R3) |
| created_at | TEXT | |

### company_settings (singleton, id=1)
name, address, gstin, state_code, logo_path, invoice_prefix (`FERT`), fy_target_paise
(monthly production target for dashboard), updated_at. Admin-editable (FR-004).

### item
| field | type | notes |
|---|---|---|
| id, name | INTEGER PK, TEXT NOT NULL | unique among non-archived |
| kind | TEXT CHECK IN ('raw','finished') | FR-009 |
| unit | TEXT NOT NULL | 'MT','kg','bags','L' |
| hsn_code | TEXT | e.g. 3102/3103/3105 |
| gst_rate | REAL CHECK IN (0,5,12,18) | tax category |
| purchase_price_paise | INTEGER | last/standard price |
| reorder_level | REAL DEFAULT 0 | low-stock flag (FR-007/SC-007) |
| archived | INTEGER 0/1 | archive instead of delete (FR-011) |
Validation: `kind='raw'` items appear in formulas/receipts; `kind='finished'` in batch output/sales lines.

### formula + formula_component
formula: id, item_id FK (finished good), name, yield_unit, active, timestamps.
formula_component: formula_id FK, item_id FK (raw), qty REAL CHECK(qty>0). UNIQUE(formula_id,item_id).
Snapshotting: batches copy components into `batch_consumption` (FR-019) — editing a formula
never mutates history.

### stock_movement (append-only ledger — FR-012/FR-014)
| field | type | notes |
|---|---|---|
| id, item_id | INTEGER PK, FK | |
| move_type | CHECK IN ('receipt','issue','return','adjustment','batch_in','batch_out','sale','sale_return') | |
| qty | REAL CHECK(qty != 0) | sign derived from type; issue/batch_out/sale negative |
| ref_type, ref_id | TEXT, INTEGER | e.g. 'invoice', 42 — optional |
| reason | TEXT | required for 'adjustment' |
| balance_after | REAL | denormalized running balance (audit + fast UI) |
| created_at, created_by | TEXT | |

Invariant (FR-013/FR-014, SC-002): computed balance = SUM(qty) per item; every write runs in
the tx and rejects if `SUM(qty) + new_qty < 0`. Consistency check function compares
`balance_after` of latest row with SUM.

### batch
id, batch_no TEXT UNIQUE (`BATCH/FY/NNN`), formula_id FK, planned_qty, actual_qty,
status CHECK IN ('open','completed','cancelled') DEFAULT 'open',
started_at, completed_at, notes, created_at, created_by.
**batch_consumption** (snapshot): batch_id FK, item_id FK, planned_qty, actual_qty.
Yield % = actual_qty / planned_qty × 100 (display); FR-016.
Completion tx (FR-017): insert `batch_out` movements for consumption, `batch_in` for output.

### qc_test
id, batch_id FK, result CHECK IN ('pass','fail','pending') DEFAULT 'pending',
parameters TEXT (JSON: {moisture: x, granule_strength: y, npk: …}) — lab values,
tested_by, tested_at, remarks. Dispatch gate (FR-018): sales lines only accept finished goods
from batches whose latest qc_test.result = 'pass'.

### supplier / customer (shared shape)
id, name NOT NULL, gstin, state_code, address, phone, email, archived, timestamps.
Referenced rows archive-only (FR-011).

### purchase_order + purchase_line + purchase_receipt
PO: id, po_no UNIQUE (`PO/FY/NNN`), supplier_id FK, status CHECK IN
('open','partial','received','cancelled'), created_at, created_by.
purchase_line: po_id FK, item_id FK, qty REAL>0, rate_paise INTEGER. UNIQUE(po_id,item_id).
receipt: id, po_id FK, received_at, invoice_ref TEXT (supplier bill no), created_by.
purchase_receipt_line: receipt_id FK, item_id FK, qty REAL>0, rate_paise INTEGER.
Receive tx (FR-021): insert receipt + `receipt` stock movements atomically; PO status =
SUM(received qty) per line vs ordered (FR-020/FR-022).

### sales_order + sales_order_line
id, so_no UNIQUE (`SO/FY/NNN`), customer_id FK, place_of_supply_state_code TEXT,
tax_mode CHECK IN ('intra','inter') — derived from company state vs place of supply (FR-024),
status CHECK IN ('draft','confirmed','invoiced','cancelled'),
created_at, created_by.
sales_order_line: so_id FK, item_id FK, batch_id FK NULL (nullable for pooled stock —
v1 uses batch-linked selection per spec FR-018/FR-023), qty REAL>0, rate_paise INTEGER,
gst_rate REAL (snapshot from item).
Validation on add: available dispatchable stock (QC-passed) ≥ qty (FR-023).

### invoice + invoice_line + payment
invoice: id, invoice_no TEXT UNIQUE, fy TEXT (`25-26`), seq INTEGER, so_id FK,
customer_id FK, tax_mode CHECK IN ('intra','inter'), place_of_supply_state_code,
invoice_date TEXT, subtotal_paise, cgst_paise, sgst_paise, igst_paise, roundoff_paise,
total_paise, amount_in_words TEXT, status CHECK IN ('unpaid','partial','paid'),
created_at, created_by. UNIQUE(fy, seq) — gapless numbering (FR-025).
invoice_line (snapshot at issue): invoice_id FK, item_id FK, batch_id, description,
hsn_code, qty, unit, rate_paise, gst_rate, taxable_paise, tax_paise. HSN summary derived.
payment: id, invoice_id FK, amount_paise INTEGER>0, paid_at, mode CHECK IN
('cash','upi','bank','cheque'), received_by, notes. Invoice tx (FR-026): allocate seq,
insert invoice + lines, insert `sale` stock movements, set SO status — all one transaction.
Status recomputed after each payment (FR-028).

### audit-lite
No separate audit table (YAGNI for v1): `created_at/created_by` on every transactional row +
append-only stock ledger + immutable invoice snapshots provide the trail.
`ponytail: no update/delete audit trail for master edits — add an audit_log table if
compliance (e.g., FCO record-keeping) later requires change history.`

## State transitions

```
purchase_order:  open → partial → received        (any → cancelled while unreceived)
sales_order:     draft → confirmed → invoiced     (draft → cancelled)
invoice:         unpaid → partial → paid          (terminal; credit notes = v2)
batch:           open → completed | cancelled
qc_test:         pending → pass | fail            (re-test = new row, latest wins)
```

## Indexes

`stock_movement(item_id, created_at)`, `stock_movement(ref_type, ref_id)`,
`batch(status)`, `qc_test(batch_id, tested_at)`, `invoice(fy, seq)`, `invoice(customer_id)`,
`sales_order(customer_id)`, `purchase_order(supplier_id)`, `sales_order_line(batch_id)`.
