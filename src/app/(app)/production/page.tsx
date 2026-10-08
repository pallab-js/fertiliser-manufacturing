import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { yieldPct } from "@/lib/batch";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SearchBar, Pagination } from "@/components/ui/page-parts";
import { NewBatchButton, QcBadge, StatusBadge, type FormulaOption } from "./production-client";

type Row = {
  id: number;
  batch_no: string;
  formula_name: string;
  status: "open" | "completed" | "cancelled";
  planned_qty: number;
  actual_qty: number;
  started_at: string;
  qc_result: string | null;
};

const PAGE_SIZE = 20;

export default async function ProductionPage({
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
         FROM batch b
         JOIN formula f ON f.id = b.formula_id
        WHERE (? = '' OR b.batch_no LIKE '%' || ? || '%' OR f.name LIKE '%' || ? || '%')`,
    )
    .get(query, query, query) as { n: number };
  const totalPages = Math.ceil(count.n / PAGE_SIZE);

  const rows = db
    .prepare(
      `SELECT b.id, b.batch_no, f.name AS formula_name, b.status,
              b.planned_qty, b.actual_qty, b.started_at,
              (SELECT q.result FROM qc_test q WHERE q.batch_id = b.id
                ORDER BY q.tested_at DESC, q.id DESC LIMIT 1) AS qc_result
         FROM batch b
         JOIN formula f ON f.id = b.formula_id
        WHERE (? = '' OR b.batch_no LIKE '%' || ? || '%' OR f.name LIKE '%' || ? || '%')
        ORDER BY b.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(query, query, query, PAGE_SIZE, (p - 1) * PAGE_SIZE) as Row[];

  const activeFormulas = db
    .prepare(
      `SELECT f.id, f.name, i.name AS output_name
         FROM formula f JOIN item i ON i.id = f.item_id
        WHERE f.active = 1 ORDER BY f.name`,
    )
    .all() as { id: number; name: string; output_name: string }[];
  const comps = db
    .prepare(
      `SELECT c.formula_id, c.item_id, c.qty, i.name
         FROM formula_component c JOIN item i ON i.id = c.item_id
        ORDER BY i.name`,
    )
    .all() as { formula_id: number; item_id: number; qty: number; name: string }[];
  const formulas: FormulaOption[] = activeFormulas.map((f) => ({
    ...f,
    components: comps.filter((c) => c.formula_id === f.id),
  }));

  const columns: Column<Row>[] = [
    {
      header: "Batch",
      cell: (r) => (
        <Link href={`/production/${r.id}`} className="text-link font-medium">
          {r.batch_no}
        </Link>
      ),
    },
    { header: "Formula", cell: (r) => r.formula_name },
    { header: "Started", cell: (r) => <span className="text-ink/60">{r.started_at.slice(0, 10)}</span> },
    {
      header: "Planned",
      cell: (r) => <span className="tabular-nums">{r.planned_qty}</span>,
      num: true,
    },
    {
      header: "Yield",
      cell: (r) =>
        r.status === "completed" ? (
          <span className="tabular-nums">{yieldPct(r.actual_qty, r.planned_qty)}%</span>
        ) : (
          <span className="text-ink/40">—</span>
        ),
      num: true,
    },
    { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { header: "QC", cell: (r) => <QcBadge result={r.qc_result} /> },
  ];

  return (
    <div>
      <PageHeader title="Production" action={<NewBatchButton formulas={formulas} />} />
      <div className="mb-4">
        <SearchBar action="/production" placeholder="Search batch / formula…" q={query} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          query ? (
            <EmptyState title="No matches" hint={`Nothing found for “${query}”.`} />
          ) : (
            <EmptyState
              title="No batches yet"
              hint="Start a batch from a formula to begin production."
            />
          )
        }
      />
      <Pagination page={p} totalPages={totalPages} basePath="/production" />
    </div>
  );
}
