import { db } from "@/db";

export type ReceivableRow = {
  customer_id: number;
  name: string;
  invoices: number;
  invoiced_paise: number;
  paid_paise: number;
  outstanding_paise: number;
};

/** FR-028: per-customer outstanding (total − payments, clamped at 0). */
export function receivablesByCustomer(): ReceivableRow[] {
  const rows = db
    .prepare(
      `SELECT cu.id AS customer_id, cu.name,
              COUNT(i.id) AS invoices,
              COALESCE(SUM(i.total_paise), 0) AS invoiced_paise,
              COALESCE((SELECT SUM(p.amount_paise) FROM payment p
                          JOIN invoice i2 ON i2.id = p.invoice_id
                         WHERE i2.customer_id = cu.id), 0) AS paid_paise
         FROM customer cu
         JOIN invoice i ON i.customer_id = cu.id
        GROUP BY cu.id
        ORDER BY (invoiced_paise - paid_paise) DESC, cu.name`,
    )
    .all() as Omit<ReceivableRow, "outstanding_paise">[];

  return rows.map((r) => ({
    ...r,
    outstanding_paise: Math.max(0, r.invoiced_paise - r.paid_paise),
  }));
}
