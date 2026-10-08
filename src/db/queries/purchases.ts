import { db } from "@/db";
import type { MonthValue } from "./dashboard";

/** FR-022 spend from RECEIPTS (matches actual purchases, not commitments),
 *  grouped by month of receipt, paise. */
export function spendByMonth(since: string): MonthValue[] {
  return db
    .prepare(
      `SELECT substr(pr.received_at, 1, 7) AS month, SUM(l.qty * l.rate_paise) AS value
         FROM purchase_receipt_line l
         JOIN purchase_receipt pr ON pr.id = l.receipt_id
        WHERE pr.received_at >= ? GROUP BY month`,
    )
    .all(since) as MonthValue[];
}

/** FR-022 spend by supplier over receipts since `since`, paise, biggest first. */
export function spendBySupplier(since: string): { supplier: string; value: number }[] {
  return db
    .prepare(
      `SELECT s.name AS supplier, SUM(l.qty * l.rate_paise) AS value
         FROM purchase_receipt_line l
         JOIN purchase_receipt pr ON pr.id = l.receipt_id
         JOIN purchase_order po ON po.id = pr.po_id
         JOIN supplier s ON s.id = po.supplier_id
        WHERE pr.received_at >= ? GROUP BY s.name ORDER BY value DESC`,
    )
    .all(since) as { supplier: string; value: number }[];
}
