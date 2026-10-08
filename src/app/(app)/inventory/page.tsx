import Link from "next/link";
import { getStockRows, type StockRow } from "@/db/queries/dashboard";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SearchBar, Pagination } from "@/components/ui/page-parts";
import { RecordMovementButton } from "./inventory-client";

const PAGE_SIZE = 20;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireUser();
  const { q, page } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const p = Math.max(1, parseInt(page ?? "1", 10));

  const all = getStockRows();
  const filtered = query ? all.filter((r) => r.name.toLowerCase().includes(query)) : all;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const rows = filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  const columns: Column<StockRow>[] = [
    {
      header: "Item",
      cell: (r) => (
        <Link href={`/inventory/${r.id}`} className="text-link font-medium">
          {r.name}
        </Link>
      ),
    },
    { header: "Kind", cell: (r) => <Badge neutral={r.kind === "raw"}>{r.kind}</Badge> },
    {
      header: "Balance",
      cell: (r) => (
        <span className="tabular-nums">
          {r.balance} {r.unit}
        </span>
      ),
      num: true,
    },
    {
      header: "Reorder at",
      cell: (r) => (
        <span className="tabular-nums text-ink/60">
          {r.reorderLevel} {r.unit}
        </span>
      ),
      num: true,
    },
    {
      header: "Status",
      cell: (r) =>
        r.reorderLevel > 0 && r.balance <= r.reorderLevel ? (
          <Badge>low stock</Badge>
        ) : (
          <Badge neutral>ok</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        action={<RecordMovementButton items={all} />}
      />
      <div className="mb-4">
        <SearchBar action="/inventory" placeholder="Search stock…" q={q ?? ""} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          query ? (
            <EmptyState title="No matches" hint={`Nothing found for “${q}”.`} />
          ) : (
            <EmptyState title="No stock yet" hint="Receipts and purchases will show balances here." />
          )
        }
      />
      <Pagination page={p} totalPages={totalPages} basePath="/inventory" />
    </div>
  );
}
