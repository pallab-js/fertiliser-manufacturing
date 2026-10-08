import { db, inTx, DomainError } from "@/db";
import { applyMovement } from "@/lib/stock";
import { financialYear, nowIso } from "@/lib/dates";

const EPS = 1e-9;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type PoLineInput = { itemId: number; qty: number; ratePaise: number };

/** PO/26-27/0007 — 4-digit per-FY counter (matches seed format). */
export function nextPoNo(date = new Date()): string {
  const fy = financialYear(date);
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM purchase_order WHERE po_no LIKE ?")
    .get(`PO/${fy}/%`) as { n: number };
  return `PO/${fy}/${String(row.n + 1).padStart(4, "0")}`;
}

/** FR-020: raise a PO with item lines (qty > 0, rate ≥ 0). */
export function createPurchaseOrder(input: {
  supplierId: number;
  lines: PoLineInput[];
  notes: string;
  userId: number;
}): { id: number; poNo: string } {
  if (input.lines.length === 0) throw new DomainError("Add at least one line");
  return inTx(() => {
    const sup = db
      .prepare("SELECT archived FROM supplier WHERE id = ?")
      .get(input.supplierId) as { archived: number } | undefined;
    if (!sup) throw new DomainError("Supplier not found");
    if (sup.archived) throw new DomainError("Supplier is archived");

    const seen = new Set<number>();
    for (const l of input.lines) {
      if (!(l.qty > 0)) throw new DomainError("Line quantities must be greater than 0");
      if (l.ratePaise < 0) throw new DomainError("Rates cannot be negative");
      if (seen.has(l.itemId)) throw new DomainError("Duplicate item on the order");
      seen.add(l.itemId);
      const item = db
        .prepare("SELECT archived FROM item WHERE id = ?")
        .get(l.itemId) as { archived: number } | undefined;
      if (!item) throw new DomainError("Item not found");
      if (item.archived) throw new DomainError("Item is archived");
    }

    const poNo = nextPoNo();
    const id = Number(
      db
        .prepare(
          "INSERT INTO purchase_order (po_no, supplier_id, notes, created_by) VALUES (?, ?, ?, ?)",
        )
        .run(poNo, input.supplierId, input.notes, input.userId).lastInsertRowid,
    );
    const line = db.prepare(
      "INSERT INTO purchase_line (po_id, item_id, qty, rate_paise) VALUES (?, ?, ?, ?)",
    );
    for (const l of input.lines) line.run(id, l.itemId, l.qty, l.ratePaise);
    return { id, poNo };
  });
}

/** Received-so-far per item: { itemId: qty }. */
export function receivedPerItem(poId: number): Record<number, number> {
  const rows = db
    .prepare(
      `SELECT l.item_id AS itemId, SUM(l.qty) AS qty
         FROM purchase_receipt_line l
         JOIN purchase_receipt r ON r.id = l.receipt_id
        WHERE r.po_id = ? GROUP BY l.item_id`,
    )
    .all(poId) as { itemId: number; qty: number }[];
  const out: Record<number, number> = {};
  for (const r of rows) out[r.itemId] = r.qty;
  return out;
}

/** FR-021: receive goods in ONE tx — receipt + receipt lines + stock in +
 *  status recompute. Cumulative over-receipt (beyond ordered qty) rejected. */
export function receiveGoods(input: {
  poId: number;
  received: Record<string, number>; // item_id → qty this time (0/absent = nothing)
  invoiceRef: string;
  userId: number;
}): number {
  return inTx(() => {
    const po = db
      .prepare("SELECT id, status FROM purchase_order WHERE id = ?")
      .get(input.poId) as { id: number; status: string } | undefined;
    if (!po) throw new DomainError("Purchase order not found");
    if (po.status === "cancelled") throw new DomainError("Order is cancelled");
    if (po.status === "received") throw new DomainError("Order is already fully received");

    const lines = db
      .prepare("SELECT item_id, qty, rate_paise FROM purchase_line WHERE po_id = ?")
      .all(input.poId) as { item_id: number; qty: number; rate_paise: number }[];
    const prior = receivedPerItem(input.poId);

    let any = false;
    for (const l of lines) {
      const got = r3(input.received[String(l.item_id)] ?? 0);
      if (got < 0 || !Number.isFinite(got)) throw new DomainError("Quantities cannot be negative");
      if (got === 0) continue;
      any = true;
      const balance = r3(l.qty - (prior[l.item_id] ?? 0));
      if (got > balance + EPS) {
        throw new DomainError(
          `Over-receipt: only ${balance} left on this line (tried ${got})`,
        );
      }
    }
    if (!any) throw new DomainError("Enter at least one quantity");

    const receiptId = Number(
      db
        .prepare(
          "INSERT INTO purchase_receipt (po_id, received_at, invoice_ref, created_by) VALUES (?, ?, ?, ?)",
        )
        .run(input.poId, nowIso(), input.invoiceRef, input.userId).lastInsertRowid,
    );

    const insLine = db.prepare(
      "INSERT INTO purchase_receipt_line (receipt_id, item_id, qty, rate_paise) VALUES (?, ?, ?, ?)",
    );
    let allDone = true;
    for (const l of lines) {
      const got = r3(input.received[String(l.item_id)] ?? 0);
      if (got > 0) {
        insLine.run(receiptId, l.item_id, got, l.rate_paise); // FR-021: store purchase price
        applyMovement({
          itemId: l.item_id,
          moveType: "receipt",
          qty: got,
          refType: "purchase_receipt",
          refId: receiptId,
          createdBy: input.userId,
        });
      }
      const done = (prior[l.item_id] ?? 0) + got >= l.qty - EPS;
      if (!done) allDone = false;
    }

    db.prepare("UPDATE purchase_order SET status = ? WHERE id = ?").run(
      allDone ? "received" : "partial",
      input.poId,
    );
    return receiptId;
  });
}

/** Cancel an open PO — received receipts (and their stock) stay as history. */
export function cancelPurchaseOrder(poId: number): void {
  const info = db
    .prepare("UPDATE purchase_order SET status = 'cancelled' WHERE id = ? AND status = 'open'")
    .run(poId);
  if (info.changes === 0) throw new DomainError("Only open orders can be cancelled");
}
