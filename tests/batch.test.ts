import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate";
import { db, DomainError } from "../src/db/index";
import { applyMovement, balanceFor, checkBalances, dispatchableQty } from "../src/lib/stock";
import {
  cancelBatch,
  completeBatchTx,
  latestQc,
  startBatch,
  yieldPct,
} from "../src/lib/batch";

runMigrations();
const userId = Number(
  db
    .prepare("INSERT INTO user (username, password_hash, role) VALUES ('op', 'x', 'operator')")
    .run().lastInsertRowid,
);
const insert = (sql: string, ...args: (string | number)[]) =>
  Number(db.prepare(sql).run(...args).lastInsertRowid);

const urea = insert("INSERT INTO item (name, kind, unit) VALUES ('Urea', 'raw', 'MT')");
const finA = insert("INSERT INTO item (name, kind, unit) VALUES ('NPK-A', 'finished', 'MT')");
const finB = insert("INSERT INTO item (name, kind, unit) VALUES ('NPK-B', 'finished', 'MT')");

/** Formula: 2 MT urea per 1 MT output. */
function mkFormula(outItem: number, compQty = 2): number {
  const fId = insert("INSERT INTO formula (item_id, name) VALUES (?, 'F')", outItem);
  db.prepare("INSERT INTO formula_component (formula_id, item_id, qty) VALUES (?, ?, ?)").run(
    fId,
    urea,
    compQty,
  );
  return fId;
}
const fA = mkFormula(finA);
const fB = mkFormula(finB);

const start = (formulaId: number, plannedQty: number) =>
  startBatch({ formulaId, plannedQty, notes: "", userId });

test("startBatch: batch_no format, planned snapshot = components × qty (FR-019)", () => {
  const { id, batchNo } = start(fA, 5);
  assert.match(batchNo, /^BATCH\/\d{2}-\d{2}\/0001$/);
  const snap = db
    .prepare(
      "SELECT item_id, planned_qty, actual_qty FROM batch_consumption WHERE batch_id = ?",
    )
    .all(id) as { item_id: number; planned_qty: number; actual_qty: number }[];
  assert.equal(snap.length, 1);
  assert.equal(snap[0].item_id, urea);
  assert.equal(snap[0].planned_qty, 10); // 2 × 5
  assert.equal(snap[0].actual_qty, 0);

  // T034: editing the formula afterwards must not touch the snapshot
  db.prepare("UPDATE formula_component SET qty = 7 WHERE formula_id = ?").run(fA);
  const after = db
    .prepare("SELECT planned_qty FROM batch_consumption WHERE batch_id = ?")
    .get(id) as { planned_qty: number };
  assert.equal(after.planned_qty, 10);
  db.prepare("UPDATE formula_component SET qty = 2 WHERE formula_id = ?").run(fA);
});

test("startBatch: inactive formula rejected; next number increments", () => {
  db.prepare("UPDATE formula SET active = 0 WHERE id = ?").run(fA);
  assert.throws(() => start(fA, 1), DomainError);
  db.prepare("UPDATE formula SET active = 1 WHERE id = ?").run(fA);
  const { batchNo } = start(fA, 1);
  assert.match(batchNo, /\/0002$/);
});

test("completeBatch: batch_out per component, batch_in yield, status/yield math", () => {
  applyMovement({ itemId: urea, moveType: "receipt", qty: 100, createdBy: userId });
  const balBefore = balanceFor(urea);
  const { id } = start(fA, 5); // needs 10 urea

  completeBatchTx({ batchId: id, actuals: {}, actualQty: 4.75, userId });

  const b = db.prepare("SELECT status, actual_qty FROM batch WHERE id = ?").get(id) as {
    status: string;
    actual_qty: number;
  };
  assert.equal(b.status, "completed");
  assert.equal(b.actual_qty, 4.75);
  assert.equal(balanceFor(urea), balBefore - 10);
  assert.equal(balanceFor(finA), 4.75);
  assert.equal(yieldPct(4.75, 5), 95);
  const out = db
    .prepare("SELECT SUM(qty) AS q FROM stock_movement WHERE batch_id = ? AND move_type = 'batch_out'")
    .get(id) as { q: number };
  assert.equal(out.q, -10);
});

test("completeBatch: actual consumption override lands on the snapshot row", () => {
  const { id } = start(fA, 5);
  completeBatchTx({ batchId: id, actuals: { [urea]: 9.5 }, actualQty: 4.9, userId });
  const row = db
    .prepare("SELECT actual_qty FROM batch_consumption WHERE batch_id = ?")
    .get(id) as { actual_qty: number };
  assert.equal(row.actual_qty, 9.5);
});

test("T037 atomicity: insufficient stock rolls back everything — ledger and batch untouched", () => {
  const { id } = start(fA, 5); // would need 10, we force 10_000
  const balBefore = balanceFor(urea);
  const movementsBefore = (
    db.prepare("SELECT COUNT(*) AS n FROM stock_movement").get() as { n: number }
  ).n;

  assert.throws(
    () => completeBatchTx({ batchId: id, actuals: { [urea]: 10_000 }, actualQty: 4, userId }),
    DomainError,
  );

  assert.equal(balanceFor(urea), balBefore);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM stock_movement").get() as { n: number }).n,
    movementsBefore,
  );
  const b = db.prepare("SELECT status FROM batch WHERE id = ?").get(id) as { status: string };
  assert.equal(b.status, "open");
  const snap = db
    .prepare("SELECT actual_qty FROM batch_consumption WHERE batch_id = ?")
    .get(id) as { actual_qty: number };
  assert.equal(snap.actual_qty, 0);
  cancelBatch(id); // cleanup → not open anymore
});

test("cancel: open → cancelled, double-cancel and complete-after-cancel rejected", () => {
  const { id } = start(fA, 1);
  cancelBatch(id);
  const b = db.prepare("SELECT status FROM batch WHERE id = ?").get(id) as { status: string };
  assert.equal(b.status, "cancelled");
  assert.throws(() => cancelBatch(id), DomainError);
  assert.throws(
    () => completeBatchTx({ batchId: id, actuals: {}, actualQty: 1, userId }),
    /not open/,
  );
});

test("T036 QC gate: untested batch undispatchable; latest result wins both ways", () => {
  const { id } = start(fB, 3);
  completeBatchTx({ batchId: id, actuals: {}, actualQty: 3, userId });
  assert.equal(balanceFor(finB), 3);

  // no test yet → not dispatchable (FR-018: pass only)
  assert.equal(dispatchableQty(finB), 0);

  const qc = (result: string) =>
    db
      .prepare("INSERT INTO qc_test (batch_id, result, tested_by) VALUES (?, ?, ?)")
      .run(id, result, userId);

  qc("pass");
  assert.equal(dispatchableQty(finB), 3);
  assert.equal(latestQc(id)?.result, "pass");

  qc("fail"); // newer fail flips it off
  assert.equal(dispatchableQty(finB), 0);
  assert.equal(latestQc(id)?.result, "fail");

  qc("pass"); // newest pass flips it back on
  assert.equal(dispatchableQty(finB), 3);
  assert.equal(latestQc(id)?.result, "pass");
});

test("yieldPct edge cases", () => {
  assert.equal(yieldPct(0, 5), 0);
  assert.equal(yieldPct(5, 5), 100);
  assert.equal(yieldPct(6, 5), 120);
  assert.equal(yieldPct(1, 0), 0);
});

test("checkBalances clean after all batch flows", () => {
  assert.deepEqual(checkBalances(), []);
});
