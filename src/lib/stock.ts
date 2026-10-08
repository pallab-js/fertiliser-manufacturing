import { db, DomainError } from "@/db";

export type MoveType =
  | "receipt"
  | "issue"
  | "return"
  | "adjustment"
  | "batch_in"
  | "batch_out"
  | "sale"
  | "sale_return";

const POSITIVE: ReadonlySet<MoveType> = new Set<MoveType>([
  "receipt",
  "return",
  "batch_in",
  "sale_return",
]);

export type MovementInput = {
  itemId: number;
  moveType: MoveType;
  qty: number; // magnitude > 0 (signed for 'adjustment': + found / − lost)
  refType?: string;
  refId?: number;
  batchId?: number;
  reason?: string;
  createdBy: number;
};

export function balanceFor(itemId: number): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(qty), 0) AS bal FROM stock_movement WHERE item_id = ?")
    .get(itemId) as { bal: number };
  return row.bal;
}

/** Insert one ledger row, refusing to drive the balance negative (FR-013).
 *  Qty is a magnitude for typed movements; for 'adjustment' it is signed
 *  (+ found / − lost), still always requiring a reason.
 *  Call inside inTx() when batching several writes (constitution III). */
export function applyMovement(m: MovementInput): number {
  const isAdjustment = m.moveType === "adjustment";
  if (!Number.isFinite(m.qty) || m.qty === 0) {
    throw new DomainError("Quantity must not be zero");
  }
  if (!isAdjustment && m.qty < 0) {
    throw new DomainError("Quantity must be greater than zero");
  }
  const signed = isAdjustment ? m.qty : POSITIVE.has(m.moveType) ? m.qty : -m.qty;
  const balance = balanceFor(m.itemId);
  const next = balance + signed;
  if (next < -1e-9) {
    throw new DomainError(
      `Insufficient stock: balance ${balance} would go negative by ${-next}`,
    );
  }
  db.prepare(
    `INSERT INTO stock_movement
       (item_id, move_type, qty, ref_type, ref_id, batch_id, reason, balance_after, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
      m.itemId,
      m.moveType,
      signed,
      m.refType ?? null,
      m.refId ?? null,
      m.batchId ?? null,
      m.reason ?? null,
      Math.abs(next) < 1e-9 ? 0 : next,
      m.createdBy,
    );
  return Math.abs(next) < 1e-9 ? 0 : next;
}

/** Dispatchable stock for an item: balances held against batches whose
 *  LATEST QC result is 'pass' (FR-018) — untested or failed batches are not
 *  dispatchable. Unbatched stock counts as dispatchable (e.g. legacy/manual
 *  stock) — ponytail: pooled-stock heuristic, refine to strict batch
 *  traceability if FCO audits demand it. */
export function dispatchableQty(itemId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(b.bal), 0) AS dispatchable
         FROM (
           SELECT batch_id, SUM(qty) AS bal
             FROM stock_movement
            WHERE item_id = ? AND batch_id IS NOT NULL
            GROUP BY batch_id
         ) b
         JOIN batch ba ON ba.id = b.batch_id AND ba.status = 'completed'
        WHERE b.bal > 0
          AND EXISTS (
            SELECT 1 FROM qc_test q
             WHERE q.batch_id = b.batch_id
               AND q.id = (SELECT q2.id FROM qc_test q2 WHERE q2.batch_id = b.batch_id
                            ORDER BY q2.tested_at DESC, q2.id DESC LIMIT 1)
               AND q.result = 'pass'
          )`
    )
    .get(itemId) as { dispatchable: number };

  const unbatched = db
    .prepare(
      `SELECT COALESCE(SUM(qty), 0) AS bal FROM stock_movement
        WHERE item_id = ? AND batch_id IS NULL`,
    )
    .get(itemId) as { bal: number };

  return row.dispatchable + unbatched.bal;
}

/** SC-002 consistency: every item's latest balance_after must equal SUM(qty). */
export function checkBalances(): { itemId: number; expected: number; actual: number }[] {
  return db
    .prepare(
      `SELECT s.item_id AS itemId,
              SUM(s.qty) AS expected,
              (SELECT balance_after FROM stock_movement
                WHERE item_id = s.item_id ORDER BY id DESC LIMIT 1) AS actual
         FROM stock_movement s
        GROUP BY s.item_id
       HAVING actual IS NOT NULL AND ABS(actual - expected) > 1e-9`
    )
    .all() as { itemId: number; expected: number; actual: number }[];
}
