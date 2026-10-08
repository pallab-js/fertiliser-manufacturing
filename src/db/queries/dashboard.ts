import { db } from "@/db";
import { lastNMonths, monthKey, nowIso } from "@/lib/dates";
import { spendByMonth } from "./purchases";

/** Dashboard aggregations (FR-006). All money in integer paise.
 *  ponytail: unindexed date scans are fine at MSME scale (thousands of
 *  rows); add indexes on invoice_date/received_at if queries ever slow down. */

export type StockRow = {
  id: number;
  name: string;
  kind: "raw" | "finished";
  unit: string;
  balance: number;
  reorderLevel: number;
};

export type MonthValue = { month: string; value: number };

export type DashboardData = {
  /** Period month keys, oldest first (FR-007). */
  period: string[];
  production: { actual: number; target: number; month: string };
  productionTrend: MonthValue[]; // actual output per month, period
  stock: StockRow[];
  lowStock: StockRow[];
  salesTrend: MonthValue[]; // paise
  purchaseSpend: MonthValue[]; // paise
  qc: { pass: number; fail: number; rate: number }; // rate 0..1, period
  receivables: number; // paise outstanding across unpaid/partial invoices
};

/** Left join against the requested months so gaps render as zeros. */
export function zeroFill(months: string[], rows: MonthValue[]): MonthValue[] {
  const byMonth = new Map(rows.map((r) => [r.month, r.value]));
  return months.map((month) => ({ month, value: byMonth.get(month) ?? 0 }));
}

/** Current balance = latest ledger row per item (append-only ledger, FR-014). */
export function getStockRows(): StockRow[] {
  return db
    .prepare(
      `SELECT i.id, i.name, i.kind, i.unit,
              i.reorder_level AS reorderLevel,
              COALESCE((SELECT sm.balance_after FROM stock_movement sm
                         WHERE sm.item_id = i.id ORDER BY sm.id DESC LIMIT 1), 0) AS balance
         FROM item i
        WHERE i.archived = 0
        ORDER BY i.kind, i.name`,
    )
    .all() as StockRow[];
}

export function getDashboardData(monthCount = 6): DashboardData {
  const period = lastNMonths(monthCount);
  const since = period[0];
  const thisMonth = monthKey(nowIso());

  const production = db
    .prepare(
      `SELECT COALESCE(SUM(actual_qty), 0) AS actual
         FROM batch
        WHERE status = 'completed' AND substr(completed_at, 1, 7) = ?`,
    )
    .get(thisMonth) as { actual: number };

  const settings = db
    .prepare("SELECT monthly_target_qty AS target FROM company_settings WHERE id = 1")
    .get() as { target: number };

  // Current balance = latest ledger row per item (shared with /inventory)
  const stock = getStockRows();

  const productionByMonth = db
    .prepare(
      `SELECT substr(completed_at, 1, 7) AS month, SUM(actual_qty) AS value
         FROM batch
        WHERE status = 'completed' AND completed_at >= ? GROUP BY month`,
    )
    .all(since) as MonthValue[];

  const salesTrend = db
    .prepare(
      `SELECT substr(invoice_date, 1, 7) AS month, SUM(total_paise) AS value
         FROM invoice WHERE invoice_date >= ? GROUP BY month`,
    )
    .all(since) as MonthValue[];

  // FR-022: spend from receipts (shared query with /purchases/reports)
  const purchaseSpend = spendByMonth(since);

  const qc = db
    .prepare(
      `SELECT SUM(result = 'pass') AS pass, SUM(result = 'fail') AS fail
         FROM qc_test WHERE tested_at >= ?`,
    )
    .get(since) as { pass: number | null; fail: number | null };

  const receivable = db
    .prepare(
      `SELECT COALESCE(SUM(i.total_paise - COALESCE(p.paid, 0)), 0) AS due
         FROM invoice i
         LEFT JOIN (SELECT invoice_id, SUM(amount_paise) AS paid
                      FROM payment GROUP BY invoice_id) p ON p.invoice_id = i.id
        WHERE i.status IN ('unpaid', 'partial')`,
    )
    .get() as { due: number };

  const pass = qc.pass ?? 0;
  const fail = qc.fail ?? 0;

  return {
    period,
    production: { actual: production.actual, target: settings.target, month: thisMonth },
    productionTrend: zeroFill(period, productionByMonth),
    stock,
    lowStock: stock.filter((s) => s.reorderLevel > 0 && s.balance <= s.reorderLevel),
    salesTrend: zeroFill(period, salesTrend),
    purchaseSpend: zeroFill(period, purchaseSpend),
    qc: { pass, fail, rate: pass + fail > 0 ? pass / (pass + fail) : 0 },
    receivables: receivable.due,
  };
}
