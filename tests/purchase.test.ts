import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate";
import { db, DomainError } from "../src/db/index";
import { balanceFor } from "../src/lib/stock";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  nextPoNo,
  receivedPerItem,
  receiveGoods,
} from "../src/lib/purchase";
import { spendByMonth, spendBySupplier } from "../src/db/queries/purchases";

runMigrations();
const userId = Number(
  db
    .prepare("INSERT INTO user (username, password_hash, role) VALUES ('op', 'x', 'operator')")
    .run().lastInsertRowid,
);
const sup1 = Number(
  db.prepare("INSERT INTO supplier (name) VALUES ('Agro Chem Pvt Ltd')").run().lastInsertRowid,
);
const sup2 = Number(
  db.prepare("INSERT INTO supplier (name) VALUES ('Fert Traders')").run().lastInsertRowid,
);
const urea = Number(
  db.prepare("INSERT INTO item (name, kind, unit) VALUES ('Urea', 'raw', 'MT')").run()
    .lastInsertRowid,
);
const dap = Number(
  db.prepare("INSERT INTO item (name, kind, unit) VALUES ('DAP', 'raw', 'MT')").run()
    .lastInsertRowid,
);

/** The 20 MT PO under test across the partial/over-receive/received steps. */
let poId = 0;

const PO_UREA_20 = { supplierId: sup1, notes: "", userId }; // filled per call

test("createPurchaseOrder: po_no format, lines stored, guards", () => {
  const { id, poNo } = createPurchaseOrder({
    ...PO_UREA_20,
    lines: [{ itemId: urea, qty: 20, ratePaise: 100_000 }],
  });
  assert.match(poNo, /^PO\/\d{2}-\d{2}\/0001$/);
  assert.equal(nextPoNo().endsWith("/0002"), true);
  const po = db.prepare("SELECT status FROM purchase_order WHERE id = ?").get(id) as {
    status: string;
  };
  assert.equal(po.status, "open");
  const lines = db
    .prepare("SELECT item_id, qty, rate_paise FROM purchase_line WHERE po_id = ?")
    .all(id) as { item_id: number; qty: number; rate_paise: number }[];
  assert.deepEqual(lines, [{ item_id: urea, qty: 20, rate_paise: 100_000 }]);

  assert.throws(
    () => createPurchaseOrder({ ...PO_UREA_20, lines: [] }),
    /at least one line/,
  );
  assert.throws(
    () =>
      createPurchaseOrder({
        ...PO_UREA_20,
        lines: [
          { itemId: urea, qty: 1, ratePaise: 1 },
          { itemId: urea, qty: 2, ratePaise: 1 },
        ],
      }),
    /Duplicate/,
  );
  assert.throws(
    () => createPurchaseOrder({ ...PO_UREA_20, lines: [{ itemId: urea, qty: 0, ratePaise: 1 }] }),
    DomainError,
  );
  assert.throws(
    () =>
      createPurchaseOrder({ ...PO_UREA_20, lines: [{ itemId: urea, qty: 1, ratePaise: -1 }] }),
    DomainError,
  );
  assert.throws(
    () => createPurchaseOrder({ ...PO_UREA_20, lines: [{ itemId: 9999, qty: 1, ratePaise: 1 }] }),
    /not found/,
  );
  assert.throws(
    () => createPurchaseOrder({ ...PO_UREA_20, supplierId: 9999, lines: [{ itemId: urea, qty: 1, ratePaise: 1 }] }),
    /not found/,
  );
});

test("V6: partial receipt → stock +12, status partial, price stored (FR-021)", () => {
  const { id } = createPurchaseOrder({
    ...PO_UREA_20,
    lines: [{ itemId: urea, qty: 20, ratePaise: 100_000 }],
  });
  const receiptId = receiveGoods({ poId: id, received: { [urea]: 12 }, invoiceRef: "INV-1", userId });

  assert.equal(balanceFor(urea), 12);
  assert.deepEqual(receivedPerItem(id), { [urea]: 12 });
  const po = db.prepare("SELECT status FROM purchase_order WHERE id = ?").get(id) as {
    status: string;
  };
  assert.equal(po.status, "partial");
  const rl = db
    .prepare("SELECT qty, rate_paise FROM purchase_receipt_line WHERE receipt_id = ?")
    .get(receiptId) as { qty: number; rate_paise: number };
  assert.equal(rl.qty, 12);
  assert.equal(rl.rate_paise, 100_000);
  const inv = db
    .prepare("SELECT invoice_ref FROM purchase_receipt WHERE id = ?")
    .get(receiptId) as { invoice_ref: string };
  assert.equal(inv.invoice_ref, "INV-1");

  // keep id for later tests
  poId = id;
});

test("over-receive rejected atomically (FR-021): ledger and receipts untouched", () => {
  const id = poId;
  const receiptsBefore = (
    db.prepare("SELECT COUNT(*) AS n FROM purchase_receipt").get() as { n: number }
  ).n;
  assert.throws(
    () => receiveGoods({ poId: id, received: { [urea]: 9 }, invoiceRef: "", userId }),
    /Over-receipt/,
  );
  assert.equal(balanceFor(urea), 12);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM purchase_receipt").get() as { n: number }).n,
    receiptsBefore,
  );
  const po = db.prepare("SELECT status FROM purchase_order WHERE id = ?").get(id) as {
    status: string;
  };
  assert.equal(po.status, "partial");

  assert.throws(() => receiveGoods({ poId: id, received: { [urea]: -1 }, invoiceRef: "", userId }), DomainError);
  assert.throws(() => receiveGoods({ poId: id, received: {}, invoiceRef: "", userId }), /at least one/);
  assert.throws(() => receiveGoods({ poId: id, received: { [dap]: 5 }, invoiceRef: "", userId }), /at least one/);
});

test("status transitions: partial → received, then no more receiving", () => {
  const id = poId;
  receiveGoods({ poId: id, received: { [urea]: 8 }, invoiceRef: "", userId });
  const po = db.prepare("SELECT status FROM purchase_order WHERE id = ?").get(id) as {
    status: string;
  };
  assert.equal(po.status, "received");
  assert.equal(receivedPerItem(id)[urea], 20);
  assert.equal(balanceFor(urea), 20);
  assert.throws(() => receiveGoods({ poId: id, received: { [urea]: 1 }, invoiceRef: "", userId }), /fully received/);
});

test("cancel: open only; cancelled/received cannot receive or re-cancel", () => {
  const { id } = createPurchaseOrder({
    supplierId: sup2,
    notes: "",
    userId,
    lines: [{ itemId: dap, qty: 5, ratePaise: 50_000 }],
  });
  cancelPurchaseOrder(id);
  const po = db.prepare("SELECT status FROM purchase_order WHERE id = ?").get(id) as {
    status: string;
  };
  assert.equal(po.status, "cancelled");
  assert.throws(() => cancelPurchaseOrder(id), /Only open/);
  assert.throws(() => receiveGoods({ poId: id, received: { [dap]: 1 }, invoiceRef: "", userId }), /cancelled/);
});

test("FR-022: spend by month and supplier matches receipts", () => {
  // same-period receipts: 20 MT urea @₹1000 + 0 MT on cancelled PO → only sup1 has spend
  const rows = spendByMonth("2000-01-01");
  const total = rows.reduce((s, r) => s + r.value, 0);
  assert.equal(total, 20 * 100_000); // paise, from receipts only

  const bySup = spendBySupplier("2000-01-01");
  assert.equal(bySup.length, 1);
  assert.equal(bySup[0].supplier, "Agro Chem Pvt Ltd");
  assert.equal(bySup[0].value, 2_000_000);

  assert.deepEqual(spendByMonth("2999-01-01"), []);
});
