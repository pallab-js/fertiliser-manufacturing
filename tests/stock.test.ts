import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate";
import { db, inTx, DomainError } from "../src/db/index";
import {
  applyMovement,
  balanceFor,
  checkBalances,
  dispatchableQty,
} from "../src/lib/stock";

runMigrations();
const userId = Number(
  db.prepare("INSERT INTO user (username, password_hash, role) VALUES ('op', 'x', 'operator')").run().lastInsertRowid,
);
const rawId = Number(
  db.prepare("INSERT INTO item (name, kind, unit) VALUES ('Urea', 'raw', 'MT')").run().lastInsertRowid,
);
const finId = Number(
  db.prepare("INSERT INTO item (name, kind, unit) VALUES ('NPK', 'finished', 'MT')").run().lastInsertRowid,
);

const mv = (
  type: Parameters<typeof applyMovement>[0]["moveType"],
  qty: number,
  extra: Partial<Parameters<typeof applyMovement>[0]> = {},
) => applyMovement({ itemId: rawId, moveType: type, qty, createdBy: userId, ...extra });

test("receipt adds, issue subtracts, balance tracks movements", () => {
  assert.equal(mv("receipt", 10), 10);
  assert.equal(mv("issue", 4), 6);
  assert.equal(balanceFor(rawId), 6);
});

test("FR-013: issue that would go negative is rejected, ledger unchanged", () => {
  const before = balanceFor(rawId);
  assert.throws(() => mv("issue", 7), DomainError);
  assert.equal(balanceFor(rawId), before);
});

test("zero/negative quantities rejected", () => {
  assert.throws(() => mv("receipt", 0), DomainError);
  assert.throws(() => mv("receipt", -5), DomainError);
});

test("adjustment is signed and requires a reason (DB CHECK)", () => {
  assert.throws(() => mv("adjustment", 1), /CHECK/);
  assert.equal(mv("adjustment", 1, { reason: "found stock" }), 7);
  assert.equal(mv("adjustment", -2, { reason: "spillage" }), 5);
});

test("multi-write tx rolls back atomically (SC-008)", () => {
  const before = balanceFor(rawId);
  assert.throws(() =>
    inTx(() => {
      mv("receipt", 5);
      mv("issue", 50); // fails → whole tx must roll back
    }),
  );
  assert.equal(balanceFor(rawId), before);
});

test("SC-002: checkBalances is clean, detects tampering", () => {
  assert.deepEqual(checkBalances(), []);
  db.prepare(
    "UPDATE stock_movement SET balance_after = balance_after + 1 WHERE id = (SELECT MAX(id) FROM stock_movement)",
  ).run();
  assert.equal(checkBalances().length, 1);
  db.prepare(
    "UPDATE stock_movement SET balance_after = balance_after - 1 WHERE id = (SELECT MAX(id) FROM stock_movement)",
  ).run();
  assert.deepEqual(checkBalances(), []);
});

test("FR-018: only QC-passed batches are dispatchable", () => {
  const fId = Number(
    db.prepare("INSERT INTO formula (item_id, name) VALUES (?, 'F')").run(finId).lastInsertRowid,
  );
  const mkBatch = (no: string, qc: "pass" | "fail") => {
    const bId = Number(
      db.prepare(
        `INSERT INTO batch (batch_no, formula_id, planned_qty, actual_qty, status,
           started_at, completed_at, created_by) VALUES (?, ?, 5, 5, 'completed', '2026-09-01', '2026-09-01', ?)`,
      ).run(no, fId, userId).lastInsertRowid,
    );
    applyMovement({ itemId: finId, moveType: "batch_in", qty: 5, batchId: bId, createdBy: userId });
    db.prepare("INSERT INTO qc_test (batch_id, result, tested_by) VALUES (?, ?, ?)").run(bId, qc, userId);
    return bId;
  };
  const pass = mkBatch("B1", "pass");
  mkBatch("B2", "fail");
  // unbatched stock counts as dispatchable; failed batch does not
  assert.equal(dispatchableQty(finId), 5);
  applyMovement({ itemId: finId, moveType: "batch_in", qty: 3, createdBy: userId }); // unbatched
  assert.equal(dispatchableQty(finId), 8);
  applyMovement({ itemId: finId, moveType: "sale", qty: 2, batchId: pass, createdBy: userId });
  assert.equal(dispatchableQty(finId), 6);
});
