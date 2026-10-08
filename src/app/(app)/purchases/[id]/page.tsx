import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { receivedPerItem } from "@/lib/purchase";
import { formatRupees } from "@/lib/money";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-parts";
import { CancelPoButton, PoStatusBadge, ReceiveForm } from "../purchases-client";

type Po = {
  id: number;
  po_no: string;
  supplier_id: number;
  supplier: string;
  status: string;
  notes: string;
  created_at: string;
};

type Line = {
  item_id: number;
  name: string;
  unit: string;
  qty: number;
  rate_paise: number;
};

type Receipt = {
  id: number;
  received_at: string;
  invoice_ref: string;
  summary: string;
};

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser(); // page requires auth; PO actions are open to both roles
  const { id } = await params;

  const po = db
    .prepare(
      `SELECT po.id, po.po_no, po.supplier_id, s.name AS supplier, po.status,
              po.notes, po.created_at
         FROM purchase_order po JOIN supplier s ON s.id = po.supplier_id
        WHERE po.id = ?`,
    )
    .get(Number(id)) as Po | undefined;
  if (!po) notFound();

  const lines = db
    .prepare(
      `SELECT l.item_id, i.name, i.unit, l.qty, l.rate_paise
         FROM purchase_line l JOIN item i ON i.id = l.item_id
        WHERE l.po_id = ? ORDER BY i.name`,
    )
    .all(po.id) as Line[];

  const prior = receivedPerItem(po.id);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  const receipts = db
    .prepare(
      `SELECT r.id, r.received_at, r.invoice_ref,
              (SELECT group_concat(i.name || ' × ' || l.qty, ', ')
                 FROM purchase_receipt_line l JOIN item i ON i.id = l.item_id
                WHERE l.receipt_id = r.id) AS summary
         FROM purchase_receipt r WHERE r.po_id = ? ORDER BY r.received_at DESC, r.id DESC`,
    )
    .all(po.id) as Receipt[];

  const outstanding = lines
    .map((l) => ({
      item_id: l.item_id,
      name: l.name,
      balance: r3(l.qty - (prior[l.item_id] ?? 0)),
    }))
    .filter((l) => l.balance > 0);

  const canReceive = po.status === "open" || po.status === "partial";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={po.po_no}
        action={po.status === "open" ? <CancelPoButton poId={po.id} /> : null}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <PoStatusBadge status={po.status} />
        <span className="text-ink/60">Supplier: {po.supplier}</span>
        <span className="text-ink/60">Raised {po.created_at.slice(0, 10)}</span>
      </div>
      {po.notes ? <p className="mb-6 text-sm text-ink/70">Notes: {po.notes}</p> : null}

      <section className="mb-8">
        <h2 className="mb-3 text-heading-sm uppercase">Lines</h2>
        <div className="panel-flat overflow-x-auto bg-surface-indigo p-6 text-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-hairline text-left text-ink/50">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Ordered</th>
                <th className="pb-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">Received</th>
                <th className="pb-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const got = r3(prior[l.item_id] ?? 0);
                const bal = r3(l.qty - got);
                return (
                  <tr key={l.item_id} className="border-b border-hairline last:border-0">
                    <td className="py-2">{l.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {l.qty} {l.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink/60">
                      {formatRupees(l.rate_paise)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{got}</td>
                    <td
                      className={`py-2 text-right tabular-nums ${bal === 0 ? "text-ink/50" : "text-magenta"}`}
                    >
                      {bal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {canReceive && outstanding.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-heading-sm uppercase">Receive goods</h2>
          <ReceiveForm poId={po.id} rows={outstanding} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-heading-sm uppercase">Receipts</h2>
        <DataTable
          columns={[
            {
              header: "Received",
              cell: (r: Receipt) => (
                <span className="text-ink/60">{r.received_at.slice(0, 10)}</span>
              ),
            },
            {
              header: "Invoice",
              cell: (r: Receipt) => r.invoice_ref || "—",
            },
            { header: "Lines", cell: (r: Receipt) => <span className="text-ink/70">{r.summary}</span> },
          ]}
          rows={receipts}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No receipts yet" hint="Partial and full receipts appear here." />}
        />
      </section>
    </div>
  );
}
