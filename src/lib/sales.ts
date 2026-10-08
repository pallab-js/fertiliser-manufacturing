import { db, inTx, DomainError } from "@/db";
import { applyMovement, dispatchableQty } from "@/lib/stock";
import { amountInWords, computeInvoiceTotals, nextInvoiceNo } from "@/lib/gst";
import { financialYear, nowIso } from "@/lib/dates";

const EPS = 1e-9;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type SoLineInput = { itemId: number; qty: number; ratePaise: number };

function companyState(): string {
  const row = db.prepare("SELECT state_code FROM company_settings WHERE id = 1").get() as
    | { state_code: string }
    | undefined;
  if (!row?.state_code) throw new DomainError("Company state not configured in settings");
  return row.state_code;
}

/** SO/FY/NNNN — 4-digit per-FY counter (matches seed format). */
export function nextSoNo(date = new Date()): string {
  const fy = financialYear(date);
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM sales_order WHERE so_no LIKE ?")
    .get(`SO/${fy}/%`) as { n: number };
  return `SO/${fy}/${String(row.n + 1).padStart(4, "0")}`;
}

/** FR-023: sales order with finished-goods lines + dispatchable-stock
 *  validation. tax_mode derives from company state vs place of supply. */
export function createSalesOrder(input: {
  customerId: number;
  placeOfSupplyStateCode: string;
  lines: SoLineInput[];
  notes: string;
  userId: number;
}): { id: number; soNo: string } {
  if (input.lines.length === 0) throw new DomainError("Add at least one line");
  return inTx(() => {
    const cust = db
      .prepare("SELECT archived FROM customer WHERE id = ?")
      .get(input.customerId) as { archived: number } | undefined;
    if (!cust) throw new DomainError("Customer not found");
    if (cust.archived) throw new DomainError("Customer is archived");

    const taxMode = companyState() === input.placeOfSupplyStateCode ? "intra" : "inter";

    const seen = new Set<number>();
    const wanted = new Map<number, number>(); // itemId → total qty
    for (const l of input.lines) {
      if (!(l.qty > 0)) throw new DomainError("Line quantities must be greater than 0");
      if (l.ratePaise < 0) throw new DomainError("Rates cannot be negative");
      if (seen.has(l.itemId)) throw new DomainError("Duplicate item on the order");
      seen.add(l.itemId);
      wanted.set(l.itemId, l.qty);
    }

    for (const [itemId, qty] of wanted) {
      const item = db
        .prepare("SELECT name, kind, archived FROM item WHERE id = ?")
        .get(itemId) as { name: string; kind: string; archived: number } | undefined;
      if (!item) throw new DomainError("Item not found");
      if (item.archived) throw new DomainError("Item is archived");
      if (item.kind !== "finished") throw new DomainError("Sales lines must be finished goods");
      const free = dispatchableQty(itemId);
      if (qty > free + EPS) {
        throw new DomainError(`Only ${r3(free)} dispatchable of ${item.name} (need ${r3(qty)})`);
      }
    }

    const soNo = nextSoNo();
    const id = Number(
      db
        .prepare(
          `INSERT INTO sales_order (so_no, customer_id, place_of_supply_state_code,
             tax_mode, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(soNo, input.customerId, input.placeOfSupplyStateCode, taxMode, input.notes, input.userId)
        .lastInsertRowid,
    );
    const line = db.prepare(
      `INSERT INTO sales_order_line (so_id, item_id, qty, rate_paise, gst_rate)
       VALUES (?, ?, ?, ?, (SELECT gst_rate FROM item WHERE id = ?))`,
    );
    for (const l of input.lines) line.run(id, l.itemId, l.qty, l.ratePaise, l.itemId);
    return { id, soNo };
  });
}

/** Cancel a draft/confirmed order — invoiced history is never touched. */
export function cancelSalesOrder(soId: number): void {
  const info = db
    .prepare(
      "UPDATE sales_order SET status = 'cancelled' WHERE id = ? AND status IN ('draft', 'confirmed')",
    )
    .run(soId);
  if (info.changes === 0) throw new DomainError("Only draft or confirmed orders can be cancelled");
}

/** Oldest completed batch, latest QC = pass, balance ≥ qty, for this output
 *  item. ponytail: single-batch-per-line allocation (seed rule) — split a
 *  line across batches if large orders ever need it. */
function pickBatch(itemId: number, qty: number): number {
  const row = db
    .prepare(
      `SELECT ba.id
         FROM batch ba
        WHERE ba.status = 'completed'
          AND (SELECT f.item_id FROM formula f WHERE f.id = ba.formula_id) = ?
          AND EXISTS (
            SELECT 1 FROM qc_test q
             WHERE q.batch_id = ba.id
               AND q.id = (SELECT q2.id FROM qc_test q2 WHERE q2.batch_id = ba.id
                            ORDER BY q2.tested_at DESC, q2.id DESC LIMIT 1)
               AND q.result = 'pass'
          )
          AND (SELECT COALESCE(SUM(qty), 0) FROM stock_movement sm WHERE sm.batch_id = ba.id) >= ?
        ORDER BY ba.completed_at ASC, ba.id ASC
        LIMIT 1`,
    )
    .get(itemId, qty) as { id: number } | undefined;
  if (!row) throw new DomainError(`No QC-passed batch holds ${r3(qty)} of this item in stock`);
  return row.id;
}

/** FR-023/026: issue the GST invoice in ONE tx — re-validate stock per line,
 *  pick QC-passed batches, allocate the FY seq, snapshot lines, reduce stock
 *  atomically, SO → invoiced. Any failure rolls everything back. */
export function issueInvoice(input: {
  soId: number;
  userId: number;
}): { invoiceId: number; invoiceNo: string } {
  return inTx(() => {
    const so = db
      .prepare(
        "SELECT id, status, customer_id, tax_mode, place_of_supply_state_code FROM sales_order WHERE id = ?",
      )
      .get(input.soId) as
      | { id: number; status: string; customer_id: number; tax_mode: "intra" | "inter"; place_of_supply_state_code: string }
      | undefined;
    if (!so) throw new DomainError("Sales order not found");
    if (so.status !== "draft" && so.status !== "confirmed")
      throw new DomainError("Only draft or confirmed orders can be invoiced");

    const lines = db
      .prepare(
        `SELECT l.id, l.item_id, l.qty, l.rate_paise, l.gst_rate,
                i.name, i.hsn_code, i.unit
           FROM sales_order_line l JOIN item i ON i.id = l.item_id
          WHERE l.so_id = ? ORDER BY l.id`,
      )
      .all(so.id) as {
      id: number;
      item_id: number;
      qty: number;
      rate_paise: number;
      gst_rate: number;
      name: string;
      hsn_code: string;
      unit: string;
    }[];
    if (lines.length === 0) throw new DomainError("Order has no lines");

    // Validate + allocate batches first — nothing written yet.
    const batchFor = new Map<number, number>();
    for (const l of lines) batchFor.set(l.id, pickBatch(l.item_id, l.qty));

    const totals = computeInvoiceTotals(
      lines.map((l) => ({
        hsnCode: l.hsn_code,
        qty: l.qty,
        ratePaise: l.rate_paise,
        gstRate: l.gst_rate,
      })),
      so.tax_mode,
    );

    const fy = financialYear();
    const { invoiceNo, seq } = nextInvoiceNo(fy); // inside tx — rollback never burns seq
    const invoiceDate = nowIso().slice(0, 10);
    const invoiceId = Number(
      db
        .prepare(
          `INSERT INTO invoice (invoice_no, fy, seq, so_id, customer_id, tax_mode,
             place_of_supply_state_code, invoice_date, subtotal_paise, cgst_paise,
             sgst_paise, igst_paise, roundoff_paise, total_paise, amount_in_words,
             status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
        )
        .run(
          invoiceNo,
          fy,
          seq,
          so.id,
          so.customer_id,
          so.tax_mode,
          so.place_of_supply_state_code,
          invoiceDate,
          totals.subtotalPaise,
          totals.cgstPaise,
          totals.sgstPaise,
          totals.igstPaise,
          totals.roundoffPaise,
          totals.totalPaise,
          amountInWords(totals.totalPaise),
          input.userId,
        )
        .lastInsertRowid,
    );

    const snapLine = db.prepare(
      `INSERT INTO invoice_line (invoice_id, item_id, batch_id, description, hsn_code,
         qty, unit, rate_paise, gst_rate, taxable_paise, tax_paise)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const setBatch = db.prepare("UPDATE sales_order_line SET batch_id = ? WHERE id = ?");
    lines.forEach((l, i) => {
      const batchId = batchFor.get(l.id)!;
      snapLine.run(
        invoiceId,
        l.item_id,
        batchId,
        l.name,
        l.hsn_code,
        l.qty,
        l.unit,
        l.rate_paise,
        l.gst_rate,
        totals.lines[i].taxablePaise,
        totals.lines[i].taxPaise,
      );
      setBatch.run(batchId, l.id);
      applyMovement({
        itemId: l.item_id,
        moveType: "sale",
        qty: l.qty,
        refType: "invoice",
        refId: invoiceId,
        batchId,
        createdBy: input.userId,
      });
    });

    db.prepare("UPDATE sales_order SET status = 'invoiced' WHERE id = ?").run(so.id);
    return { invoiceId, invoiceNo };
  });
}

/** FR-028: record a payment and recompute unpaid|partial|paid. */
export function recordPayment(input: {
  invoiceId: number;
  amountPaise: number;
  mode: "cash" | "upi" | "bank" | "cheque";
  notes: string;
  userId: number;
}): void {
  if (!(input.amountPaise > 0)) throw new DomainError("Amount must be greater than zero");
  inTx(() => {
    const inv = db.prepare("SELECT id, total_paise FROM invoice WHERE id = ?").get(input.invoiceId) as
      | { id: number; total_paise: number }
      | undefined;
    if (!inv) throw new DomainError("Invoice not found");

    db.prepare(
      `INSERT INTO payment (invoice_id, amount_paise, paid_at, mode, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(inv.id, input.amountPaise, nowIso(), input.mode, input.notes, input.userId);

    const paid = (
      db
        .prepare("SELECT COALESCE(SUM(amount_paise), 0) AS paid FROM payment WHERE invoice_id = ?")
        .get(inv.id) as { paid: number }
    ).paid;
    const status = paid >= inv.total_paise ? "paid" : paid > 0 ? "partial" : "unpaid";
    db.prepare("UPDATE invoice SET status = ? WHERE id = ?").run(status, inv.id);
  });
}
