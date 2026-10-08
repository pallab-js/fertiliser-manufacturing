import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { formatRupees } from "@/lib/money";
import { dispatchableQty } from "@/lib/stock";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SearchBar, Pagination } from "@/components/ui/page-parts";
import { NewSoButton, SoStatusBadge } from "./sales-client";

type Row = {
  id: number;
  so_no: string;
  customer: string;
  status: string;
  tax_mode: string;
  value_paise: number;
  created_at: string;
  invoice_no: string | null;
  invoice_id: number | null;
};

const PAGE_SIZE = 20;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireUser();
  const { q, page } = await searchParams;
  const query = (q ?? "").trim();
  const p = Math.max(1, parseInt(page ?? "1", 10));

  const count = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM sales_order so
         JOIN customer c ON c.id = so.customer_id
         LEFT JOIN invoice inv ON inv.so_id = so.id
        WHERE (? = '' OR so.so_no LIKE '%' || ? || '%' OR c.name LIKE '%' || ? || '%')`,
    )
    .get(query, query, query) as { n: number };
  const totalPages = Math.ceil(count.n / PAGE_SIZE);

  const rows = db
    .prepare(
      `SELECT so.id, so.so_no, so.status, so.tax_mode, so.created_at,
              c.name AS customer, inv.invoice_no, inv.id AS invoice_id,
              (SELECT COALESCE(SUM(qty * rate_paise), 0) FROM sales_order_line l
                WHERE l.so_id = so.id) AS value_paise
         FROM sales_order so
         JOIN customer c ON c.id = so.customer_id
         LEFT JOIN invoice inv ON inv.so_id = so.id
        WHERE (? = '' OR so.so_no LIKE '%' || ? || '%' OR c.name LIKE '%' || ? || '%')
        ORDER BY so.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(query, query, query, PAGE_SIZE, (p - 1) * PAGE_SIZE) as Row[];

  const customers = db
    .prepare("SELECT id, name FROM customer WHERE archived = 0 ORDER BY name")
    .all() as { id: number; name: string }[];

  const items = (
    db
      .prepare(
        "SELECT id, name, unit, gst_rate, purchase_price_paise FROM item WHERE archived = 0 AND kind = 'finished' ORDER BY name",
      )
      .all() as {
      id: number;
      name: string;
      unit: string;
      gst_rate: number;
      purchase_price_paise: number;
    }[]
  ).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    gstRate: i.gst_rate,
    priceRupees: i.purchase_price_paise / 100,
    dispatchable: Math.round(dispatchableQty(i.id) * 1000) / 1000,
  }));

  const company = db
    .prepare("SELECT state_code FROM company_settings WHERE id = 1")
    .get() as { state_code: string } | undefined;

  const columns: Column<Row>[] = [
    {
      header: "Order",
      cell: (r) => (
        <Link href={`/sales/${r.id}`} className="text-link font-medium">
          {r.so_no}
        </Link>
      ),
    },
    { header: "Customer", cell: (r) => r.customer },
    {
      header: "Invoice",
      cell: (r) =>
        r.invoice_id ? (
          <Link href={`/sales/invoices/${r.invoice_id}`} className="text-link">
            {r.invoice_no}
          </Link>
        ) : (
          <span className="text-ink/40">—</span>
        ),
    },
    {
      header: "Value",
      cell: (r) => <span className="tabular-nums">{formatRupees(r.value_paise)}</span>,
      num: true,
    },
    {
      header: "Tax",
      cell: (r) => (
        <span className="text-ink/60">{r.tax_mode === "intra" ? "CGST/SGST" : "IGST"}</span>
      ),
    },
    {
      header: "Date",
      cell: (r) => <span className="text-ink/60">{r.created_at.slice(0, 10)}</span>,
    },
    { header: "Status", cell: (r) => <SoStatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Sales"
        action={
          <div className="flex gap-3">
            <Link href="/sales/receivables" className="btn-ghost-sm">
              Receivables
            </Link>
            <NewSoButton
              customers={customers}
              items={items}
              companyStateCode={company?.state_code ?? "27"}
            />
          </div>
        }
      />
      <div className="mb-4">
        <SearchBar action="/sales" placeholder="Search SO / customer…" q={query} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          query ? (
            <EmptyState title="No matches" hint={`Nothing found for “${query}”.`} />
          ) : (
            <EmptyState title="No sales orders yet" hint="Create the first order to sell finished goods." />
          )
        }
      />
      <Pagination page={p} totalPages={totalPages} basePath="/sales" />
    </div>
  );
}
