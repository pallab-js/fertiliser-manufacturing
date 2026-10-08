import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SearchBar, Pagination } from "@/components/ui/page-parts";
import { NewItemButton, ArchiveItemButton } from "./items-client";

type Row = {
  id: number;
  name: string;
  kind: "raw" | "finished";
  unit: string;
  hsn_code: string;
  gst_rate: number;
  purchase_price_paise: number;
  reorder_level: number;
  archived: number;
};

const PAGE_SIZE = 20;

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireUser();
  const { q, page } = await searchParams;
  const query = (q ?? "").trim();
  const p = Math.max(1, parseInt(page ?? "1", 10));

  const count = db
    .prepare(
      `SELECT COUNT(*) AS n FROM item WHERE (? = '' OR name LIKE '%' || ? || '%')`,
    )
    .get(query, query) as { n: number };
  const totalPages = Math.ceil(count.n / PAGE_SIZE);

  const rows = db
    .prepare(
      `SELECT id, name, kind, unit, hsn_code, gst_rate, purchase_price_paise,
              reorder_level, archived
         FROM item
        WHERE (? = '' OR name LIKE '%' || ? || '%')
        ORDER BY archived, kind, name
        LIMIT ? OFFSET ?`,
    )
    .all(query, query, PAGE_SIZE, (p - 1) * PAGE_SIZE) as Row[];

  const columns: Column<Row>[] = [
    {
      header: "Name",
      cell: (r) => (
        <Link href={`/items/${r.id}`} className="text-link font-medium">
          {r.name}
        </Link>
      ),
    },
    {
      header: "Kind",
      cell: (r) => <Badge neutral={r.kind === "raw"}>{r.kind}</Badge>,
    },
    { header: "Unit", cell: (r) => r.unit },
    { header: "HSN", cell: (r) => <span className="text-ink/60">{r.hsn_code || "—"}</span> },
    { header: "GST", cell: (r) => `${r.gst_rate}%`, num: true },
    {
      header: "Price",
      cell: (r) => `₹${(r.purchase_price_paise / 100).toFixed(2)}`,
      num: true,
    },
    { header: "Reorder", cell: (r) => r.reorder_level, num: true },
    {
      header: "",
      cell: (r) =>
        session.role === "admin" ? <ArchiveItemButton id={r.id} archived={r.archived === 1} /> : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Items" action={session.role === "admin" ? <NewItemButton /> : null} />
      <div className="mb-4">
        <SearchBar action="/items" placeholder="Search items…" q={query} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          query ? (
            <EmptyState title="No matches" hint={`Nothing found for “${query}”.`} />
          ) : (
            <EmptyState title="No items yet" hint="Create your first raw material or finished good." />
          )
        }
      />
      <Pagination page={p} totalPages={totalPages} basePath="/items" />
    </div>
  );
}
