import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate";
import { db } from "../src/db/index";

test("migrations apply from 0 and are idempotent", () => {
  assert.equal(Number(db.pragma("user_version", { simple: true })), 0);
  const v1 = runMigrations();
  assert.equal(v1, 1);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => (r as { name: string }).name);
  for (const t of ["user", "session", "company_settings", "item", "formula",
    "formula_component", "stock_movement", "batch", "batch_consumption", "qc_test",
    "supplier", "customer", "purchase_order", "purchase_line", "purchase_receipt",
    "purchase_receipt_line", "sales_order", "sales_order_line", "invoice",
    "invoice_line", "payment"])
    assert.ok(tables.includes(t), `missing table ${t}`);

  // rerun: nothing changes
  assert.equal(runMigrations(), 1);
});

test("constraints reject bad rows", () => {
  assert.throws(
    () => db.prepare(
      "INSERT INTO stock_movement (item_id, move_type, qty, balance_after, created_by) VALUES (1, 'nonsense', 1, 1, 1)",
    ).run(),
    /CHECK|FOREIGN KEY/,
  );
});
