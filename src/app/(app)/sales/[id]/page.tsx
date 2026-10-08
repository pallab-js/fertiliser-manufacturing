import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { formatRupees } from "@/lib/money";
import { stateName } from "@/lib/states";
import { PageHeader } from "@/components/ui/page-parts";
import { CancelSoButton, IssueInvoiceButton, SoStatusBadge } from "../sales-client";

type So = {
  id: number;
  so_no: string;
  customer: string;
  status: string;
  tax_mode: "intra" | "inter";
  place_of_supply_state_code: string;
  notes: string;
  created_at: string;
  invoice_id: number | null;
  invoice_no: string | null;
};

type Line = {
  item_id: number;
  name: string;
  unit: string;
  qty: number;
  rate_paise: number;
  gst_rate: number;
  batch_no: string | null;
};

export default async function SalesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const so = db
    .prepare(
      `SELECT so.id, so.so_no, so.status, so.tax_mode, so.place_of_supply_state_code,
              so.notes, so.created_at, c.name AS customer,
              inv.id AS invoice_id, inv.invoice_no
         FROM sales_order so
         JOIN customer c ON c.id = so.customer_id
         LEFT JOIN invoice inv ON inv.so_id = so.id
        WHERE so.id = ?`,
    )
    .get(Number(id)) as So | undefined;
  if (!so) notFound();

  const lines = db
    .prepare(
      `SELECT l.item_id, i.name, i.unit, l.qty, l.rate_paise, l.gst_rate, b.batch_no
         FROM sales_order_line l
         JOIN item i ON i.id = l.item_id
         LEFT JOIN batch b ON b.id = l.batch_id
        WHERE l.so_id = ? ORDER BY l.id`,
    )
    .all(so.id) as Line[];

  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.qty * l.rate_paise), 0);
  const canIssue = so.status === "draft" || so.status === "confirmed";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={so.so_no}
        action={
          <div className="flex items-center gap-3">
            {canIssue ? (
              <>
                <CancelSoButton soId={so.id} />
                <IssueInvoiceButton soId={so.id} />
              </>
            ) : null}
            {so.invoice_id ? (
              <Link href={`/sales/invoices/${so.invoice_id}`} className="btn-green">
                View invoice
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <SoStatusBadge status={so.status} />
        <span className="text-ink/60">Customer: {so.customer}</span>
        <span className="text-ink/60">
          Place of supply: {stateName(so.place_of_supply_state_code)}
        </span>
        <span className="text-ink/60">
          {so.tax_mode === "intra" ? "Intra-state · CGST + SGST" : "Inter-state · IGST"}
        </span>
        <span className="text-ink/60">Raised {so.created_at.slice(0, 10)}</span>
      </div>
      {so.notes ? <p className="mb-6 text-sm text-ink/70">Notes: {so.notes}</p> : null}

      <section className="mb-8">
        <h2 className="mb-3 text-heading-sm uppercase">Lines</h2>
        <div className="panel-flat overflow-x-auto bg-surface-indigo p-6 text-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-hairline text-left text-ink/50">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium">Batch</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">GST</th>
                <th className="pb-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.item_id} className="border-b border-hairline last:border-0">
                  <td className="py-2">{l.name}</td>
                  <td className="py-2 text-ink/60">{l.batch_no ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">
                    {l.qty} {l.unit}
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink/60">
                    {formatRupees(l.rate_paise)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink/60">{l.gst_rate}%</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatRupees(Math.round(l.qty * l.rate_paise))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-hairline">
                <td colSpan={5} className="pt-3 text-right text-ink/60">
                  Taxable value
                </td>
                <td className="pt-3 text-right font-medium tabular-nums">
                  {formatRupees(subtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
