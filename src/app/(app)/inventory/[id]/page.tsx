import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-parts";

/** Mirror of lib/stock POSITIVE — signed display for the history ledger. */
const POSITIVE = new Set(["receipt", "return", "batch_in", "sale_return"]);

type Mv = {
  id: number;
  created_at: string;
  move_type: string;
  qty: number;
  balance_after: number;
  reason: string | null;
  ref_type: string | null;
  ref_id: number | null;
};

const HISTORY_LIMIT = 100; // ponytail: no pagination, show latest N — add Pagination when ledgers hurt

export default async function ItemStockHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const item = db
    .prepare("SELECT id, name, unit FROM item WHERE id = ?")
    .get(Number(id)) as { id: number; name: string; unit: string } | undefined;
  if (!item) notFound();

  const movements = db
    .prepare(
      `SELECT id, created_at, move_type, qty, balance_after, reason, ref_type, ref_id
         FROM stock_movement WHERE item_id = ?
        ORDER BY id DESC LIMIT ?`,
    )
    .all(item.id, HISTORY_LIMIT) as Mv[];

  const current = movements[0]?.balance_after ?? 0;

  const columns: Column<Mv>[] = [
    { header: "Date", cell: (r) => <span className="text-ink/60">{r.created_at.slice(0, 16).replace("T", " ")}</span> },
    { header: "Type", cell: (r) => <Badge neutral={!r.move_type.includes("sale") && r.move_type !== "batch_in"}>{r.move_type}</Badge> },
    {
      header: "Qty",
      cell: (r) => (
        <span className="tabular-nums">
          {POSITIVE.has(r.move_type) || (r.move_type === "adjustment" && r.qty >= 0) ? "+" : ""}
          {r.qty} {item.unit}
        </span>
      ),
      num: true,
    },
    {
      header: "Balance after",
      cell: (r) => (
        <span className="tabular-nums font-medium">
          {r.balance_after} {item.unit}
        </span>
      ),
      num: true,
    },
    { header: "Reason / ref", cell: (r) => <span className="text-ink/70">{r.reason || (r.ref_type ? `${r.ref_type} #${r.ref_id}` : "—")}</span> },
  ];

  return (
    <div>
      <PageHeader title={item.name} />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink/60">
        <span>
          Current balance:{" "}
          <span className="tabular-nums font-medium text-ink">
            {current} {item.unit}
          </span>
        </span>
        {movements.length === HISTORY_LIMIT ? (
          <span>· showing latest {HISTORY_LIMIT} movements</span>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        rows={movements}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No movements yet" hint="Record a movement to start this ledger." />}
      />
    </div>
  );
}
