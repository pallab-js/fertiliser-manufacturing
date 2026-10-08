import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { latestQc, yieldPct } from "@/lib/batch";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-parts";
import {
  AddQcForm,
  CancelBatchButton,
  CompleteBatchForm,
  QcBadge,
  StatusBadge,
} from "../production-client";

type Batch = {
  id: number;
  batch_no: string;
  formula_id: number;
  formula_name: string;
  output_item_id: number;
  output_name: string;
  planned_qty: number;
  actual_qty: number;
  status: "open" | "completed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  notes: string;
};

type Consumption = {
  item_id: number;
  name: string;
  planned_qty: number;
  actual_qty: number;
};

type QcRow = {
  id: number;
  result: string;
  parameters: string;
  remarks: string;
  tested_at: string;
  tester: string;
};

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser(); // page requires auth; batch actions are open to both roles
  const { id } = await params;

  const batch = db
    .prepare(
      `SELECT b.id, b.batch_no, b.formula_id, f.name AS formula_name,
              f.item_id AS output_item_id, i.name AS output_name,
              b.planned_qty, b.actual_qty, b.status, b.started_at,
              b.completed_at, b.notes
         FROM batch b
         JOIN formula f ON f.id = b.formula_id
         JOIN item i ON i.id = f.item_id
        WHERE b.id = ?`,
    )
    .get(Number(id)) as Batch | undefined;
  if (!batch) notFound();

  const consumption = db
    .prepare(
      `SELECT c.item_id, i.name, c.planned_qty, c.actual_qty
         FROM batch_consumption c JOIN item i ON i.id = c.item_id
        WHERE c.batch_id = ? ORDER BY i.name`,
    )
    .all(batch.id) as Consumption[];

  const qcTests = db
    .prepare(
      `SELECT q.id, q.result, q.parameters, q.remarks, q.tested_at, u.username AS tester
         FROM qc_test q JOIN user u ON u.id = q.tested_by
        WHERE q.batch_id = ? ORDER BY q.tested_at DESC, q.id DESC`,
    )
    .all(batch.id) as QcRow[];

  const latest = latestQc(batch.id);
  const isOpen = batch.status === "open";

  const qcColumns: Column<QcRow>[] = [
    {
      header: "Result",
      cell: (q) => <QcBadge result={q.result} />,
    },
    {
      header: "Parameters",
      cell: (q) => <code className="text-xs text-ink/70">{q.parameters}</code>,
    },
    { header: "Remarks", cell: (q) => <span className="text-ink/70">{q.remarks || "—"}</span> },
    { header: "Tester", cell: (q) => q.tester },
    {
      header: "Tested at",
      cell: (q) => <span className="text-ink/60">{q.tested_at.slice(0, 16).replace("T", " ")}</span>,
    },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={batch.batch_no}
        action={isOpen ? <CancelBatchButton batchId={batch.id} /> : null}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={batch.status} />
        <QcBadge result={latest?.result ?? null} />
        <span className="text-ink/60">Formula: {batch.formula_name}</span>
        <span className="text-ink/60">Output: {batch.output_name}</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="panel-flat bg-surface-indigo p-4 text-sm">
          <p className="text-ink/50">Planned</p>
          <p className="text-heading-sm tabular-nums">{batch.planned_qty} MT</p>
        </div>
        <div className="panel-flat bg-surface-indigo p-4 text-sm">
          <p className="text-ink/50">Actual yield</p>
          <p className="text-heading-sm tabular-nums">
            {batch.status === "completed" ? `${batch.actual_qty} MT` : "—"}
          </p>
        </div>
        <div className="panel-flat bg-surface-indigo p-4 text-sm">
          <p className="text-ink/50">Yield</p>
          <p className="text-heading-sm tabular-nums">
            {batch.status === "completed"
              ? `${yieldPct(batch.actual_qty, batch.planned_qty)}%`
              : "—"}
          </p>
        </div>
        <div className="panel-flat bg-surface-indigo p-4 text-sm">
          <p className="text-ink/50">Started</p>
          <p className="font-medium">{batch.started_at.slice(0, 10)}</p>
          {batch.completed_at ? (
            <p className="text-ink/50">Done {batch.completed_at.slice(0, 10)}</p>
          ) : null}
        </div>
      </div>

      {batch.notes ? <p className="mb-6 text-sm text-ink/70">Notes: {batch.notes}</p> : null}

      <section className="mb-8">
        <h2 className="mb-3 text-heading-sm uppercase">Consumption</h2>
        {isOpen ? (
          <CompleteBatchForm
            batchId={batch.id}
            rows={consumption.map((c) => ({
              item_id: c.item_id,
              name: c.name,
              planned_qty: c.planned_qty,
            }))}
            plannedQty={batch.planned_qty}
          />
        ) : (
          <div className="panel-flat overflow-x-auto bg-surface-indigo p-6 text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline text-left text-ink/50">
                  <th className="pb-2 font-medium">Component</th>
                  <th className="pb-2 text-right font-medium">Planned</th>
                  <th className="pb-2 text-right font-medium">Actual</th>
                  <th className="pb-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {consumption.map((c) => {
                  const v = Math.round((c.actual_qty - c.planned_qty) * 1000) / 1000;
                  return (
                    <tr key={c.item_id} className="border-b border-hairline last:border-0">
                      <td className="py-2">{c.name}</td>
                      <td className="py-2 text-right tabular-nums text-ink/60">{c.planned_qty}</td>
                      <td className="py-2 text-right tabular-nums">{c.actual_qty}</td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          v === 0 ? "text-ink/50" : v > 0 ? "text-magenta" : ""
                        }`}
                      >
                        {v > 0 ? `+${v}` : v}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-heading-sm uppercase">QC tests</h2>
        <DataTable
          columns={qcColumns}
          rows={qcTests}
          rowKey={(q) => q.id}
          empty={
            <EmptyState title="No tests yet" hint="Record lab results — latest result decides dispatch." />
          }
        />
        {batch.status !== "cancelled" ? (
          <div className="panel-flat mt-6 bg-surface-indigo p-6">
            <h3 className="mb-4 text-sm font-medium uppercase text-ink/70">Add test</h3>
            <AddQcForm batchId={batch.id} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
