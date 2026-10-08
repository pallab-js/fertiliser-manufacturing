import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { formatRupees } from "@/lib/money";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SearchBar, Pagination } from "@/components/ui/page-parts";
import { NewPoButton, PoStatusBadge } from "./purchases-client";

type Row = {
  id: number;
  po_no: string;
  supplier: string;
  status: string;
  lines: number;
  value_paise: number;
  created_at: string;
};

const PAGE_SIZE = 20;

export default async function PurchasesPage({
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
         FROM purchase_order po
         JOIN supplier s ON s.id = po.supplier_id
        WHERE (? = '' OR po.po_no LIKE '%' || ? || '%' OR s.name LIKE '%' || ? || '%')`,
    )
    .get(query, query, query) as { n: number };
  const totalPages = Math.ceil(count.n / PAGE_SIZE);

  const rows = db
    .prepare(
      `SELECT po.id, po.po_no, po.status, po.created_at, s.name AS supplier,
              (SELECT COUNT(*) FROM purchase_line l WHERE l.po_id = po.id) AS lines,
              (SELECT COALESCE(SUM(qty * rate_paise), 0) FROM purchase_line l
                WHERE l.po_id = po.id) AS value_paise
         FROM purchase_order po
         JOIN supplier s ON s.id = po.supplier_id
        WHERE (? = '' OR po.po_no LIKE '%' || ? || '%' OR s.name LIKE '%' || ? || '%')
        ORDER BY po.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(query, query, query, PAGE_SIZE, (p - 1) * PAGE_SIZE) as Row[];

  const items = db
    .prepare(
      "SELECT id, name, unit FROM item WHERE archived = 0 AND kind = 'raw' ORDER BY name",
    )
    .all() as { id: number; name: string; unit: string }[];
  const suppliers = db
    .prepare("SELECT id, name FROM supplier WHERE archived = 0 ORDER BY name")
    .all() as { id: number; name: string }[];

  const columns: Column<Row>[] = [
    {
      header: "PO",
      cell: (r) => (
        <Link href={`/purchases/${r.id}`} className="text-link font-medium">
          {r.po_no}
        </Link>
      ),
    },
    { header: "Supplier", cell: (r) => r.supplier },
    {
      header: "Value",
      cell: (r) => <span className="tabular-nums">{formatRupees(r.value_paise)}</span>,
      num: true,
    },
    { header: "Lines", cell: (r) => r.lines, num: true },
    {
      header: "Date",
      cell: (r) => <span className="text-ink/60">{r.created_at.slice(0, 10)}</span>,
    },
    { header: "Status", cell: (r) => <PoStatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Purchases"
        action={
          <div className="flex gap-3">
            <Link href="/purchases/reports" className="btn-ghost-sm">
              Reports
            </Link>
            <NewPoButton items={items} suppliers={suppliers} />
          </div>
        }
      />
      <div className="mb-4">
        <SearchBar action="/purchases" placeholder="Search PO / supplier…" q={query} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          query ? (
            <EmptyState title="No matches" hint={`Nothing found for “${query}”.`} />
          ) : (
            <EmptyState title="No purchase orders yet" hint="Raise your first PO against a supplier." />
          )
        }
      />
      <Pagination page={p} totalPages={totalPages} basePath="/purchases" />
    </div>
  );
}
