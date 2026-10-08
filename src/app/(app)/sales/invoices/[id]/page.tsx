import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { formatRupees, formatQty } from "@/lib/money";
import { stateName } from "@/lib/states";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-parts";
import { PrintButton, RecordPaymentForm, SoStatusBadge } from "../../sales-client";
import "../print.css";

type Invoice = {
  id: number;
  invoice_no: string;
  invoice_date: string;
  so_id: number;
  so_no: string;
  tax_mode: "intra" | "inter";
  place_of_supply_state_code: string;
  status: string;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  roundoff_paise: number;
  total_paise: number;
  amount_in_words: string;
  customer: string;
  customer_gstin: string;
  customer_address: string;
  customer_state_code: string;
  company_name: string;
  company_address: string;
  company_gstin: string;
  company_state: string;
};

type Line = {
  description: string;
  hsn_code: string;
  batch_no: string | null;
  qty: number;
  unit: string;
  rate_paise: number;
  gst_rate: number;
  taxable_paise: number;
  tax_paise: number;
};

type HsnRow = { hsn_code: string; gst_rate: number; taxable_paise: number; tax_paise: number };

type PaymentRow = { id: number; paid_at: string; amount_paise: number; mode: string; notes: string };

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const inv = db
    .prepare(
      `SELECT i.id, i.invoice_no, i.invoice_date, i.tax_mode, i.place_of_supply_state_code,
              i.status, i.subtotal_paise, i.cgst_paise, i.sgst_paise, i.igst_paise,
              i.roundoff_paise, i.total_paise, i.amount_in_words,
              so.so_no, so.id AS so_id, c.name AS customer, c.gstin AS customer_gstin,
              c.address AS customer_address, c.state_code AS customer_state_code,
              cs.name AS company_name, cs.address AS company_address,
              cs.gstin AS company_gstin, cs.state_name AS company_state
         FROM invoice i
         JOIN sales_order so ON so.id = i.so_id
         JOIN customer c ON c.id = i.customer_id
         LEFT JOIN company_settings cs ON cs.id = 1
        WHERE i.id = ?`,
    )
    .get(Number(id)) as Invoice | undefined;
  if (!inv) notFound();

  const lines = db
    .prepare(
      `SELECT l.description, l.hsn_code, b.batch_no, l.qty, l.unit, l.rate_paise,
              l.gst_rate, l.taxable_paise, l.tax_paise
         FROM invoice_line l LEFT JOIN batch b ON b.id = l.batch_id
        WHERE l.invoice_id = ? ORDER BY l.id`,
    )
    .all(inv.id) as Line[];

  // HSN summary recomputed from the snapshot lines — sums to subtotal / total tax.
  const hsn = new Map<string, HsnRow>();
  for (const l of lines) {
    const key = `${l.hsn_code}|${l.gst_rate}`;
    const g = hsn.get(key) ?? { hsn_code: l.hsn_code, gst_rate: l.gst_rate, taxable_paise: 0, tax_paise: 0 };
    g.taxable_paise += l.taxable_paise;
    g.tax_paise += l.tax_paise;
    hsn.set(key, g);
  }

  const payments = db
    .prepare(
      "SELECT id, paid_at, amount_paise, mode, notes FROM payment WHERE invoice_id = ? ORDER BY paid_at DESC, id DESC",
    )
    .all(inv.id) as PaymentRow[];
  const paid = payments.reduce((s, p) => s + p.amount_paise, 0);

  const taxRows: { label: string; paise: number }[] =
    inv.tax_mode === "intra"
      ? [
          { label: "CGST", paise: inv.cgst_paise },
          { label: "SGST", paise: inv.sgst_paise },
        ]
      : [{ label: "IGST", paise: inv.igst_paise }];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={inv.invoice_no}
        action={
          <div className="flex items-center gap-3 no-print">
            <Link href={`/sales/${inv.so_id}`} className="btn-ghost-sm">
              View order
            </Link>
            <PrintButton />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm no-print">
        <Badge neutral={inv.status === "paid"}>{inv.status}</Badge>
        <SoStatusBadge status="invoiced" />
        <span className="text-ink/60">Order: {inv.so_no}</span>
        <span className="text-ink/60">
          {inv.tax_mode === "intra" ? "Intra-state · CGST + SGST" : "Inter-state · IGST"}
        </span>
      </div>

      <div className="invoice-print panel-flat mb-8 bg-surface-indigo p-6 md:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <p className="font-display text-lg font-extrabold">{inv.company_name}</p>
            <p className="text-sm text-ink/60">{inv.company_address}</p>
            <p className="text-sm text-ink/60">GSTIN: {inv.company_gstin || "—"}</p>
            <p className="text-sm text-ink/60">State: {inv.company_state}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-sm font-bold uppercase tracking-widest">Tax invoice</p>
            <p className="mt-1 text-sm text-ink/70">{inv.invoice_no}</p>
            <p className="text-sm text-ink/60">Date: {inv.invoice_date}</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-ink/50">Bill to</p>
          <p className="mt-1 font-medium">{inv.customer}</p>
          <p className="text-sm text-ink/60">{inv.customer_address}</p>
          <p className="text-sm text-ink/60">GSTIN: {inv.customer_gstin || "—"}</p>
          <p className="text-sm text-ink/60">State: {stateName(inv.customer_state_code)}</p>
          <p className="text-sm text-ink/60">
            Place of supply: {stateName(inv.place_of_supply_state_code)}
          </p>
        </div>

        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-ink/50">
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium">HSN</th>
              <th className="pb-2 font-medium">Batch</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Rate</th>
              <th className="pb-2 text-right font-medium">GST</th>
              <th className="pb-2 text-right font-medium">Taxable</th>
              <th className="pb-2 text-right font-medium">Tax</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-hairline last:border-0">
                <td className="py-2">{l.description}</td>
                <td className="py-2 text-ink/60">{l.hsn_code || "—"}</td>
                <td className="py-2 text-ink/60">{l.batch_no ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">{formatQty(l.qty, l.unit)}</td>
                <td className="py-2 text-right tabular-nums">{formatRupees(l.rate_paise)}</td>
                <td className="py-2 text-right tabular-nums">{l.gst_rate}%</td>
                <td className="py-2 text-right tabular-nums">{formatRupees(l.taxable_paise)}</td>
                <td className="py-2 text-right tabular-nums">{formatRupees(l.tax_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-widest text-ink/50">HSN summary</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-ink/50">
                <th className="pb-2 font-medium">HSN</th>
                <th className="pb-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">Taxable value</th>
                <th className="pb-2 text-right font-medium">Tax</th>
              </tr>
            </thead>
            <tbody>
              {[...hsn.values()].map((g) => (
                <tr key={`${g.hsn_code}|${g.gst_rate}`} className="border-b border-hairline last:border-0">
                  <td className="py-1.5">{g.hsn_code || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{g.gst_rate}%</td>
                  <td className="py-1.5 text-right tabular-nums">{formatRupees(g.taxable_paise)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatRupees(g.tax_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-sm space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/60">Taxable value</span>
            <span className="tabular-nums">{formatRupees(inv.subtotal_paise)}</span>
          </div>
          {taxRows.map((t) => (
            <div key={t.label} className="flex justify-between">
              <span className="text-ink/60">{t.label}</span>
              <span className="tabular-nums">{formatRupees(t.paise)}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-ink/60">Round off</span>
            <span className="tabular-nums">{formatRupees(inv.roundoff_paise)}</span>
          </div>
          <div className="flex justify-between border-t border-hairline pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatRupees(inv.total_paise)}</span>
          </div>
        </div>

        <p className="mt-4 border-t border-hairline pt-4 text-sm italic">
          {inv.amount_in_words}
        </p>
      </div>

      <section className="mb-8 no-print">
        <h2 className="mb-3 text-heading-sm uppercase">Payments</h2>
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" hint="Record the first payment against this invoice." />
        ) : (
          <div className="panel-flat overflow-x-auto bg-surface-indigo p-6 text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline text-left text-ink/50">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Mode</th>
                  <th className="pb-2 font-medium">Notes</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-hairline last:border-0">
                    <td className="py-2 text-ink/60">{p.paid_at.slice(0, 10)}</td>
                    <td className="py-2 uppercase">{p.mode}</td>
                    <td className="py-2 text-ink/60">{p.notes || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{formatRupees(p.amount_paise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline">
                  <td colSpan={3} className="pt-3 text-right text-ink/60">
                    Received / outstanding
                  </td>
                  <td className="pt-3 text-right tabular-nums">
                    {formatRupees(paid)} /{" "}
                    {formatRupees(Math.max(0, inv.total_paise - paid))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {inv.status !== "paid" ? (
        <section className="no-print">
          <h2 className="mb-3 text-heading-sm uppercase">Record payment</h2>
          <RecordPaymentForm invoiceId={inv.id} />
        </section>
      ) : null}
    </div>
  );
}
