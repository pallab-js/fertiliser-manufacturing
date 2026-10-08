-- 001_init.sql — full schema (specs/001-fertilizer-msme/data-model.md)
-- Money = INTEGER paise; quantities = REAL; timestamps = ISO-8601 UTC TEXT.

CREATE TABLE user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE session (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_session_user ON session(user_id);

CREATE TABLE company_settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  name               TEXT NOT NULL,
  address            TEXT NOT NULL DEFAULT '',
  gstin              TEXT NOT NULL DEFAULT '',
  state_code         TEXT NOT NULL DEFAULT '',
  state_name         TEXT NOT NULL DEFAULT '',
  invoice_prefix     TEXT NOT NULL DEFAULT 'FERT',
  monthly_target_qty REAL NOT NULL DEFAULT 0 CHECK (monthly_target_qty >= 0),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE item (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('raw', 'finished')),
  unit                 TEXT NOT NULL CHECK (unit IN ('MT', 'kg', 'bags', 'L')),
  hsn_code             TEXT NOT NULL DEFAULT '',
  gst_rate             REAL NOT NULL DEFAULT 5 CHECK (gst_rate IN (0, 5, 12, 18)),
  purchase_price_paise INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_paise >= 0),
  reorder_level        REAL NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  archived             INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_item_name_active ON item(name) WHERE archived = 0;

CREATE TABLE formula (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES item(id),
  name       TEXT NOT NULL,
  yield_unit TEXT NOT NULL DEFAULT 'MT',
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE formula_component (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  formula_id INTEGER NOT NULL REFERENCES formula(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES item(id),
  qty        REAL NOT NULL CHECK (qty > 0),
  UNIQUE (formula_id, item_id)
);

-- Append-only stock ledger. batch_id links produced/sold quantities to batches.
CREATE TABLE stock_movement (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES item(id),
  move_type     TEXT NOT NULL CHECK (move_type IN
                  ('receipt', 'issue', 'return', 'adjustment',
                   'batch_in', 'batch_out', 'sale', 'sale_return')),
  qty           REAL NOT NULL CHECK (qty != 0),
  ref_type      TEXT,
  ref_id        INTEGER,
  batch_id      INTEGER REFERENCES batch(id),
  reason        TEXT,
  balance_after REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by    INTEGER NOT NULL REFERENCES user(id),
  CHECK (move_type != 'adjustment' OR reason IS NOT NULL)
);
CREATE INDEX idx_sm_item_date ON stock_movement(item_id, created_at);
CREATE INDEX idx_sm_ref ON stock_movement(ref_type, ref_id);
CREATE INDEX idx_sm_batch ON stock_movement(batch_id);

CREATE TABLE batch (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no     TEXT NOT NULL UNIQUE,
  formula_id   INTEGER NOT NULL REFERENCES formula(id),
  planned_qty  REAL NOT NULL CHECK (planned_qty > 0),
  actual_qty   REAL NOT NULL DEFAULT 0 CHECK (actual_qty >= 0),
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'completed', 'cancelled')),
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by   INTEGER NOT NULL REFERENCES user(id)
);
CREATE INDEX idx_batch_status ON batch(status);

-- Formula snapshot at batch time (FR-019): formula edits never mutate history.
CREATE TABLE batch_consumption (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id    INTEGER NOT NULL REFERENCES batch(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES item(id),
  planned_qty REAL NOT NULL CHECK (planned_qty >= 0),
  actual_qty  REAL NOT NULL DEFAULT 0 CHECK (actual_qty >= 0),
  UNIQUE (batch_id, item_id)
);

CREATE TABLE qc_test (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id    INTEGER NOT NULL REFERENCES batch(id) ON DELETE CASCADE,
  result      TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'pending'))
                DEFAULT 'pending',
  parameters  TEXT NOT NULL DEFAULT '{}',
  remarks     TEXT NOT NULL DEFAULT '',
  tested_by   INTEGER NOT NULL REFERENCES user(id),
  tested_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_qc_batch ON qc_test(batch_id, tested_at);

CREATE TABLE supplier (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  gstin      TEXT NOT NULL DEFAULT '',
  state_code TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE customer (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  gstin        TEXT NOT NULL DEFAULT '',
  state_code   TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  archived     INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE purchase_order (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no       TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES supplier(id),
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'partial', 'received', 'cancelled')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by  INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE purchase_line (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id       INTEGER NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES item(id),
  qty         REAL NOT NULL CHECK (qty > 0),
  rate_paise  INTEGER NOT NULL CHECK (rate_paise >= 0),
  UNIQUE (po_id, item_id)
);

CREATE TABLE purchase_receipt (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id       INTEGER NOT NULL REFERENCES purchase_order(id),
  received_at TEXT NOT NULL,
  invoice_ref TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by  INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE purchase_receipt_line (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id  INTEGER NOT NULL REFERENCES purchase_receipt(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES item(id),
  qty         REAL NOT NULL CHECK (qty > 0),
  rate_paise  INTEGER NOT NULL CHECK (rate_paise >= 0),
  UNIQUE (receipt_id, item_id)
);

CREATE TABLE sales_order (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  so_no                     TEXT NOT NULL UNIQUE,
  customer_id               INTEGER NOT NULL REFERENCES customer(id),
  place_of_supply_state_code TEXT NOT NULL,
  tax_mode                  TEXT NOT NULL CHECK (tax_mode IN ('intra', 'inter')),
  status                    TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'confirmed', 'invoiced', 'cancelled')),
  notes                     TEXT NOT NULL DEFAULT '',
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by                INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE sales_order_line (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  so_id      INTEGER NOT NULL REFERENCES sales_order(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES item(id),
  batch_id   INTEGER REFERENCES batch(id),
  qty        REAL NOT NULL CHECK (qty > 0),
  rate_paise INTEGER NOT NULL CHECK (rate_paise >= 0),
  gst_rate   REAL NOT NULL CHECK (gst_rate IN (0, 5, 12, 18))
);
CREATE INDEX idx_sol_so ON sales_order_line(so_id);
CREATE INDEX idx_sol_batch ON sales_order_line(batch_id);

CREATE TABLE invoice (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no                TEXT NOT NULL UNIQUE,
  fy                        TEXT NOT NULL,
  seq                       INTEGER NOT NULL,
  so_id                     INTEGER NOT NULL REFERENCES sales_order(id),
  customer_id               INTEGER NOT NULL REFERENCES customer(id),
  tax_mode                  TEXT NOT NULL CHECK (tax_mode IN ('intra', 'inter')),
  place_of_supply_state_code TEXT NOT NULL,
  invoice_date              TEXT NOT NULL,
  subtotal_paise            INTEGER NOT NULL DEFAULT 0,
  cgst_paise                INTEGER NOT NULL DEFAULT 0,
  sgst_paise                INTEGER NOT NULL DEFAULT 0,
  igst_paise                INTEGER NOT NULL DEFAULT 0,
  roundoff_paise            INTEGER NOT NULL DEFAULT 0,
  total_paise               INTEGER NOT NULL DEFAULT 0,
  amount_in_words           TEXT NOT NULL DEFAULT '',
  status                    TEXT NOT NULL DEFAULT 'unpaid'
                            CHECK (status IN ('unpaid', 'partial', 'paid')),
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by                INTEGER NOT NULL REFERENCES user(id),
  UNIQUE (fy, seq)
);

CREATE TABLE invoice_line (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   INTEGER NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES item(id),
  batch_id     INTEGER REFERENCES batch(id),
  description  TEXT NOT NULL,
  hsn_code     TEXT NOT NULL DEFAULT '',
  qty          REAL NOT NULL CHECK (qty > 0),
  unit         TEXT NOT NULL,
  rate_paise   INTEGER NOT NULL CHECK (rate_paise >= 0),
  gst_rate     REAL NOT NULL CHECK (gst_rate IN (0, 5, 12, 18)),
  taxable_paise INTEGER NOT NULL,
  tax_paise     INTEGER NOT NULL
);
CREATE INDEX idx_invline_invoice ON invoice_line(invoice_id);

CREATE TABLE payment (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id  INTEGER NOT NULL REFERENCES invoice(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  paid_at     TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('cash', 'upi', 'bank', 'cheque')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by  INTEGER NOT NULL REFERENCES user(id)
);
CREATE INDEX idx_payment_invoice ON payment(invoice_id);
