import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate";
import { db, inTx, DomainError } from "../src/db/index";
import { amountInWords, computeInvoiceTotals, nextInvoiceNo } from "../src/lib/gst";
import {
  cancelSalesOrder,
  createSalesOrder,
  issueInvoice,
  recordPayment,
} from "../src/lib/sales";
import { applyMovement, balanceFor } from "../src/lib/stock";

runMigrations();

db.prepare(
  `INSERT INTO company_settings (id, name, state_code, state_name, invoice_prefix)
   VALUES (1, 'Test Fertilizers', '27', 'Maharashtra', 'FERT')`,
).run();
const userId = Number(
  db
    .prepare("INSERT INTO user (username, password_hash, role) VALUES ('op', 'x', 'operator')")
    .run().lastInsertRowid,
);
const insert = (sql: string, ...args: (string | number)[]) =>
  Number(db.prepare(sql).run(...args).lastInsertRowid);

const custIntra = insert(
  "INSERT INTO customer (name, state_code) VALUES ('Local Traders', '27')",
);
const fin = insert(
  `INSERT INTO item (name, kind, unit, hsn_code, gst_rate, purchase_price_paise)
   VALUES ('NPK 20-20-0', 'finished', 'MT', '31051000', 12, 500000)`,
);

// Completed, QC-passed batch holding 10 MT of `fin` — dispatchable stock.
const formulaId = insert("INSERT INTO formula (item_id, name) VALUES (?, 'F')", fin);
const batchId = insert(
  `INSERT INTO batch (batch_no, formula_id, planned_qty, actual_qty, status, started_at, completed_at, created_by)
   VALUES ('BATCH/26-27/T001', ?, 10, 10, 'completed', '2026-04-01T09:00:00Z', '2026-04-03T09:00:00Z', ?)`,
  formulaId,
  userId,
);
db.prepare(
  "INSERT INTO qc_test (batch_id, result, tested_by) VALUES (?, 'pass', ?)",
).run(batchId, userId);
applyMovement({ itemId: fin, moveType: "batch_in", qty: 10, batchId, createdBy: userId });

const newSo = (customerId: number, pos: string, qty: number, rate = 500000) =>
  createSalesOrder({
    customerId,
    placeOfSupplyStateCode: pos,
    lines: [{ itemId: fin, qty, ratePaise: rate }],
    notes: "",
    userId,
  });

/* ---------- computeInvoiceTotals (T048: slab splits, intra vs inter) ---------- */

test("slab splits: HSN groups, per-line round, remainder to SGST", () => {
  const t = computeInvoiceTotals(
    [
      { hsnCode: "31051000", qty: 2, ratePaise: 100000, gstRate: 12 },
      { hsnCode: "31051000", qty: 1, ratePaise: 100000, gstRate: 12 },
      { hsnCode: "31023000", qty: 3, ratePaise: 50000, gstRate: 5 },
    ],
    "intra",
  );
  assert.deepEqual(t.lines, [
    { taxablePaise: 200000, taxPaise: 24000 },
    { taxablePaise: 100000, taxPaise: 12000 },
    { taxablePaise: 150000, taxPaise: 7500 },
  ]);
  assert.equal(t.subtotalPaise, 450000);
  assert.equal(t.cgstPaise, 21750); // (24000 + 12000 + 7500) / 2
  assert.equal(t.sgstPaise, 21750);
  assert.equal(t.igstPaise, 0);
  assert.equal(t.hsnSummary.length, 2);
  const a = t.hsnSummary.find((g) => g.hsnCode === "31051000")!;
  assert.equal(a.taxablePaise, 300000);
  assert.equal(a.taxPaise, 36000);

  // odd tax: cgst rounds up (half away), sgst takes the remainder
  const odd = computeInvoiceTotals(
    [{ hsnCode: "X", qty: 1, ratePaise: 2542, gstRate: 12 }],
    "intra",
  );
  assert.equal(odd.lines[0].taxPaise, 305);
  assert.equal(odd.cgstPaise, 153);
  assert.equal(odd.sgstPaise, 152);
  assert.equal(odd.cgstPaise + odd.sgstPaise, odd.lines[0].taxPaise);
});

test("intra vs inter: IGST equals CGST+SGST, no split in inter", () => {
  const lines = [
    { hsnCode: "31051000", qty: 2, ratePaise: 100000, gstRate: 12 },
    { hsnCode: "31023000", qty: 3, ratePaise: 50000, gstRate: 5 },
  ];
  const intra = computeInvoiceTotals(lines, "intra");
  const inter = computeInvoiceTotals(lines, "inter");
  assert.equal(inter.cgstPaise, 0);
  assert.equal(inter.sgstPaise, 0);
  assert.equal(inter.igstPaise, intra.cgstPaise + intra.sgstPaise);
  assert.equal(inter.totalPaise, intra.totalPaise);
});

test("round-off identity: total is whole rupees and sums exactly", () => {
  const t = computeInvoiceTotals(
    [{ hsnCode: "X", qty: 1, ratePaise: 1005, gstRate: 12 }],
    "intra",
  );
  assert.equal(t.lines[0].taxablePaise, 1005);
  assert.equal(t.lines[0].taxPaise, 121);
  assert.equal(t.cgstPaise + t.sgstPaise, 121);
  assert.equal(t.totalPaise % 100, 0); // whole rupees
  assert.equal(Math.abs(t.roundoffPaise) <= 50, true);
  assert.equal(
    t.totalPaise,
    t.subtotalPaise + t.cgstPaise + t.sgstPaise + t.igstPaise + t.roundoffPaise,
  );
  // HSN summary sums to the same numbers (exact sum, V7)
  assert.equal(
    t.hsnSummary.reduce((s, g) => s + g.taxablePaise, 0),
    t.subtotalPaise,
  );
});

/* ---------- amountInWords (Indian lakh/crore) ---------- */

test("amountInWords: Indian numbering, paise, zero", () => {
  assert.equal(amountInWords(0), "Rupees Zero Only");
  assert.equal(amountInWords(2500), "Rupees Twenty Five Only");
  assert.equal(amountInWords(1050), "Rupees Ten and Fifty Paise Only");
  assert.equal(amountInWords(150000), "Rupees One Thousand Five Hundred Only");
  assert.equal(amountInWords(100000000), "Rupees Ten Lakh Only");
  assert.equal(amountInWords(1000000000), "Rupees One Crore Only");
  assert.equal(
    amountInWords(123456789),
    "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only",
  );
});

/* ---------- FR-025 numbering: unique per FY, rollback never burns a seq ---------- */

test("nextInvoiceNo: unique per FY and rollback doesn't burn a seq", () => {
  const fy = "99-00";
  const first = nextInvoiceNo(fy);
  assert.equal(first.invoiceNo, "FERT/99-00/0001");

  // persist it so the counter can move
  const soId = Number(
    db
      .prepare(
        `INSERT INTO sales_order (so_no, customer_id, place_of_supply_state_code, tax_mode, created_by)
         VALUES ('SO/99-00/0001', ?, '27', 'intra', ?)`,
      )
      .run(custIntra, userId).lastInsertRowid,
  );
  const persist = (seq: number, invoiceNo: string) =>
    db
      .prepare(
        `INSERT INTO invoice (invoice_no, fy, seq, so_id, customer_id, tax_mode,
           place_of_supply_state_code, invoice_date, created_by)
         VALUES (?, ?, ?, ?, ?, 'intra', '27', '2026-04-01', ?)`,
      )
      .run(invoiceNo, fy, seq, soId, custIntra, userId);
  persist(first.seq, first.invoiceNo);
  assert.equal(nextInvoiceNo(fy).seq, 2);

  // UNIQUE(fy, seq) backstop
  assert.throws(() => persist(first.seq, "FERT/99-00/DUP"));

  // issue inside an outer tx that fails afterwards → seq not burned
  assert.throws(() =>
    inTx(() => {
      const n = nextInvoiceNo(fy);
      persist(n.seq, n.invoiceNo);
      throw new Error("boom");
    }),
  );
  assert.equal(nextInvoiceNo(fy).seq, 2); // still 2 — rollback released it
});

/* ---------- SO validation + issueInvoice (FR-023/026) ---------- */

test("createSalesOrder: dispatchable-stock guard + tax_mode from place of supply", () => {
  assert.throws(
    () => newSo(custIntra, "27", 999),
    /Only .* dispatchable/,
  );

  const intra = newSo(custIntra, "27", 1);
  const inter = newSo(custIntra, "24", 1); // supply to Gujarat → interstate
  const modes = db
    .prepare("SELECT tax_mode FROM sales_order WHERE id IN (?, ?)")
    .all(intra.id, inter.id) as { tax_mode: string }[];
  assert.deepEqual(new Set(modes.map((m) => m.tax_mode)), new Set(["intra", "inter"]));
  assert.match(intra.soNo, /^SO\/\d{2}-\d{2}\/\d{4}$/);

  cancelSalesOrder(inter.id);
  assert.throws(() => cancelSalesOrder(inter.id), DomainError); // not cancellable twice
});

test("issueInvoice: one tx — snapshots, stock down, SO invoiced (V7)", () => {
  const before = balanceFor(fin);
  const { id } = newSo(custIntra, "27", 3);
  const { invoiceId, invoiceNo } = issueInvoice({ soId: id, userId });
  assert.match(invoiceNo, /^FERT\/\d{2}-\d{2}\/\d{4}$/);

  const inv = db
    .prepare(
      `SELECT status, tax_mode, subtotal_paise, cgst_paise, sgst_paise, igst_paise,
              roundoff_paise, total_paise, amount_in_words
         FROM invoice WHERE id = ?`,
    )
    .get(invoiceId) as Record<string, number | string>;
  assert.equal(inv.status, "unpaid");
  assert.equal(inv.tax_mode, "intra");
  assert.equal(inv.subtotal_paise, 1500000); // 3 × ₹5000
  assert.equal(inv.cgst_paise, 90000);
  assert.equal(inv.sgst_paise, 90000);
  assert.equal(inv.total_paise, 1500000 + 180000);
  assert.equal(
    inv.total_paise,
    Number(inv.subtotal_paise) + Number(inv.cgst_paise) + Number(inv.sgst_paise) +
      Number(inv.igst_paise) + Number(inv.roundoff_paise),
  );
  assert.match(String(inv.amount_in_words), /^Rupees .* Only$/);

  // snapshot line carries batch + HSN numbers
  const line = db
    .prepare("SELECT batch_id, hsn_code, qty, taxable_paise, tax_paise FROM invoice_line WHERE invoice_id = ?")
    .get(invoiceId) as { batch_id: number; hsn_code: string; qty: number; taxable_paise: number; tax_paise: number };
  assert.equal(line.batch_id, batchId);
  assert.equal(line.hsn_code, "31051000");
  assert.equal(line.taxable_paise, 1500000);
  assert.equal(line.tax_paise, 180000);

  assert.equal(balanceFor(fin), before - 3); // FR-026 stock reduced
  const so = db.prepare("SELECT status FROM sales_order WHERE id = ?").get(id) as { status: string };
  assert.equal(so.status, "invoiced");
  const soLine = db.prepare("SELECT batch_id FROM sales_order_line WHERE so_id = ?").get(id) as {
    batch_id: number;
  };
  assert.equal(soLine.batch_id, batchId);

  // re-issue rejected, state untouched
  assert.throws(() => issueInvoice({ soId: id, userId }), /draft or confirmed/);
  assert.equal(balanceFor(fin), before - 3);
});

test("issueInvoice: stock re-validated at issue time (drained batch blocks)", () => {
  const { id } = newSo(custIntra, "27", 5);
  // drain the batch between order and invoice
  applyMovement({ itemId: fin, moveType: "sale", qty: 5, batchId, createdBy: userId });
  const invBefore = (db.prepare("SELECT COUNT(*) AS n FROM invoice").get() as { n: number }).n;
  assert.throws(() => issueInvoice({ soId: id, userId }), /No QC-passed batch holds/);
  const so = db.prepare("SELECT status FROM sales_order WHERE id = ?").get(id) as { status: string };
  assert.equal(so.status, "draft"); // nothing written
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM invoice").get() as { n: number }).n,
    invBefore,
  ); // no invoice appeared
  cancelSalesOrder(id); // cleanup
});

test("outer-tx failure rolls the whole issue back (SC-008)", () => {
  const before = balanceFor(fin);
  const invBefore = (db.prepare("SELECT COUNT(*) AS n FROM invoice").get() as { n: number }).n;
  const { id } = newSo(custIntra, "27", 2);

  assert.throws(() =>
    inTx(() => {
      issueInvoice({ soId: id, userId });
      throw new Error("boom");
    }),
  );

  assert.equal(balanceFor(fin), before); // stock restored
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM invoice").get() as { n: number }).n,
    invBefore,
  );
  const so = db.prepare("SELECT status FROM sales_order WHERE id = ?").get(id) as { status: string };
  assert.equal(so.status, "draft"); // can still be issued
  cancelSalesOrder(id); // cleanup
});

/* ---------- FR-028 payments ---------- */

test("recordPayment: partial → paid status recompute", () => {
  const { id } = newSo(custIntra, "27", 2);
  const { invoiceId } = issueInvoice({ soId: id, userId });
  const total = 1120000; // 2 × ₹5000 + 12% GST, whole rupees

  assert.throws(() => recordPayment({ invoiceId, amountPaise: 0, mode: "cash", notes: "", userId }), DomainError);
  recordPayment({ invoiceId, amountPaise: 400000, mode: "upi", notes: "part", userId });
  assert.equal(
    (db.prepare("SELECT status FROM invoice WHERE id = ?").get(invoiceId) as { status: string }).status,
    "partial",
  );
  recordPayment({ invoiceId, amountPaise: total - 400000, mode: "bank", notes: "", userId });
  assert.equal(
    (db.prepare("SELECT status FROM invoice WHERE id = ?").get(invoiceId) as { status: string }).status,
    "paid",
  );
});
