import { db, inTx, DomainError } from "@/db";
import { applyMovement } from "@/lib/stock";
import { financialYear, nowIso } from "@/lib/dates";

/** Round to 3 decimals — matches seed's consumption/yield precision. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Yield % with one decimal; 0 when nothing was planned. */
export function yieldPct(actual: number, planned: number): number {
  if (planned <= 0) return 0;
  return Math.round((actual / planned) * 1000) / 10;
}

/** BATCH/26-27/0007 — 4-digit per-FY counter (matches seed format).
 *  COUNT+1 is safe: batches are never deleted, only cancelled. */
export function nextBatchNo(date = new Date()): string {
  const fy = financialYear(date);
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM batch WHERE batch_no LIKE ?")
    .get(`BATCH/${fy}/%`) as { n: number };
  return `BATCH/${fy}/${String(row.n + 1).padStart(4, "0")}`;
}

/** Start a batch: create it 'open' and snapshot the formula's planned
 *  components (FR-019) — later formula edits never touch this history. */
export function startBatch(input: {
  formulaId: number;
  plannedQty: number;
  notes: string;
  userId: number;
}): { id: number; batchNo: string } {
  return inTx(() => {
    const f = db.prepare("SELECT id, active FROM formula WHERE id = ?").get(input.formulaId) as
      | { id: number; active: number }
      | undefined;
    if (!f) throw new DomainError("Formula not found");
    if (f.active !== 1) throw new DomainError("Formula is inactive");
    const comps = db
      .prepare("SELECT item_id, qty FROM formula_component WHERE formula_id = ?")
      .all(input.formulaId) as { item_id: number; qty: number }[];
    if (comps.length === 0) throw new DomainError("Formula has no components");

    const batchNo = nextBatchNo();
    const id = Number(
      db
        .prepare(
          `INSERT INTO batch (batch_no, formula_id, planned_qty, status, started_at, notes, created_by)
           VALUES (?, ?, ?, 'open', ?, ?, ?)`,
        )
        .run(batchNo, input.formulaId, input.plannedQty, nowIso(), input.notes, input.userId)
        .lastInsertRowid,
    );
    const snap = db.prepare(
      "INSERT INTO batch_consumption (batch_id, item_id, planned_qty, actual_qty) VALUES (?, ?, ?, 0)",
    );
    for (const c of comps) snap.run(id, c.item_id, r3(c.qty * input.plannedQty));
    return { id, batchNo };
  });
}

/** Complete a batch in ONE tx (FR-016/017): record actual consumption on the
 *  snapshot rows, issue batch_out per consumed component, receive batch_in of
 *  the yield, mark completed. Any insufficient stock (FR-013) rolls the whole
 *  thing back — ledger and batch untouched. */
export function completeBatchTx(input: {
  batchId: number;
  actuals: Record<string, number>; // item_id → actual consumed (defaults to planned)
  actualQty: number; // yield
  userId: number;
}): void {
  inTx(() => {
    const b = db
      .prepare(
        `SELECT b.id, b.status, f.item_id AS output_item
           FROM batch b JOIN formula f ON f.id = b.formula_id WHERE b.id = ?`,
      )
      .get(input.batchId) as { id: number; status: string; output_item: number } | undefined;
    if (!b) throw new DomainError("Batch not found");
    if (b.status !== "open") throw new DomainError("Batch is not open");

    const rows = db
      .prepare(
        "SELECT id, item_id, planned_qty FROM batch_consumption WHERE batch_id = ?",
      )
      .all(input.batchId) as { id: number; item_id: number; planned_qty: number }[];
    if (rows.length === 0) throw new DomainError("Batch has no consumption rows");

    const upd = db.prepare("UPDATE batch_consumption SET actual_qty = ? WHERE id = ?");
    for (const row of rows) {
      const actual = r3(input.actuals[String(row.item_id)] ?? row.planned_qty);
      upd.run(actual, row.id);
      if (actual > 0) {
        applyMovement({
          itemId: row.item_id,
          moveType: "batch_out",
          qty: actual,
          refType: "batch",
          refId: input.batchId,
          batchId: input.batchId,
          createdBy: input.userId,
        });
      }
    }

    const yieldQty = r3(input.actualQty);
    if (yieldQty > 0) {
      applyMovement({
        itemId: b.output_item,
        moveType: "batch_in",
        qty: yieldQty,
        refType: "batch",
        refId: input.batchId,
        batchId: input.batchId,
        createdBy: input.userId,
      });
    }

    db.prepare(
      "UPDATE batch SET actual_qty = ?, status = 'completed', completed_at = ? WHERE id = ?",
    ).run(yieldQty, nowIso(), input.batchId);
  });
}

/** Cancel an open batch — no stock effects, history preserved. */
export function cancelBatch(batchId: number): void {
  const info = db
    .prepare("UPDATE batch SET status = 'cancelled' WHERE id = ? AND status = 'open'")
    .run(batchId);
  if (info.changes === 0) throw new DomainError("Only open batches can be cancelled");
}

/** Latest QC result per batch (tested_at DESC, id DESC) — latest wins. */
export function latestQc(batchId: number): { result: string; tested_at: string } | undefined {
  return db
    .prepare(
      "SELECT result, tested_at FROM qc_test WHERE batch_id = ? ORDER BY tested_at DESC, id DESC LIMIT 1",
    )
    .get(batchId) as { result: string; tested_at: string } | undefined;
}
