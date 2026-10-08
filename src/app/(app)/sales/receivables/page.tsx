import { requireUser } from "@/lib/guard";
import { receivablesByCustomer } from "@/db/queries/sales";
import { formatRupees } from "@/lib/money";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-parts";

type Row = {
  customer_id: number;
  name: string;
  invoices: number;
  invoiced_paise: number;
  paid_paise: number;
  outstanding_paise: number;
};

export default async function ReceivablesPage() {
  await requireUser();

  const rows = receivablesByCustomer().filter((r) => r.invoiced_paise > 0);
  const totals = rows.reduce(
    (acc, r) => ({
      invoiced: acc.invoiced + r.invoiced_paise,
      paid: acc.paid + r.paid_paise,
      outstanding: acc.outstanding + r.outstanding_paise,
    }),
    { invoiced: 0, paid: 0, outstanding: 0 },
  );

  const columns: Column<Row>[] = [
    { header: "Customer", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Invoices", cell: (r) => r.invoices, num: true },
    {
      header: "Invoiced",
      cell: (r) => <span className="tabular-nums">{formatRupees(r.invoiced_paise)}</span>,
      num: true,
    },
    {
      header: "Received",
      cell: (r) => (
        <span className="tabular-nums text-ink/60">{formatRupees(r.paid_paise)}</span>
      ),
      num: true,
    },
    {
      header: "Outstanding",
      cell: (r) => (
        <span
          className={`tabular-nums ${r.outstanding_paise > 0 ? "text-magenta" : "text-ink/50"}`}
        >
          {formatRupees(r.outstanding_paise)}
        </span>
      ),
      num: true,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Receivables"
        action={<span className="text-sm text-ink/60">per customer, all invoices</span>}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.customer_id}
        empty={<EmptyState title="Nothing owed" hint="Invoices appear here as soon as they are issued." />}
      />
      {rows.length > 0 ? (
        <div className="mt-4 flex justify-end gap-6 border-t border-hairline pt-4 text-sm">
          <span className="text-ink/60">
            Invoiced <span className="ml-2 tabular-nums text-ink">{formatRupees(totals.invoiced)}</span>
          </span>
          <span className="text-ink/60">
            Received <span className="ml-2 tabular-nums text-ink">{formatRupees(totals.paid)}</span>
          </span>
          <span className="text-ink/60">
            Outstanding{" "}
            <span className="ml-2 font-semibold tabular-nums text-magenta">
              {formatRupees(totals.outstanding)}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
