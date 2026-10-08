import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SearchBar, Pagination } from "@/components/ui/page-parts";
import { NewFormulaButton, SetFormulaActiveButton } from "./formulas-client";

type Row = {
  id: number;
  name: string;
  active: number;
  item_name: string;
  comps: number;
};

const PAGE_SIZE = 20;

export default async function FormulasPage({
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
      `SELECT COUNT(*) AS n
         FROM formula f
         JOIN item i ON i.id = f.item_id
        WHERE (? = '' OR f.name LIKE '%' || ? || '%')`,
    )
    .get(query, query) as { n: number };
  const totalPages = Math.ceil(count.n / PAGE_SIZE);

  const rows = db
    .prepare(
      `SELECT f.id, f.name, f.active, i.name AS item_name,
              (SELECT COUNT(*) FROM formula_component c WHERE c.formula_id = f.id) AS comps
         FROM formula f
         JOIN item i ON i.id = f.item_id
        WHERE (? = '' OR f.name LIKE '%' || ? || '%')
        ORDER BY f.active DESC, f.name
        LIMIT ? OFFSET ?`,
    )
    .all(query, query, PAGE_SIZE, (p - 1) * PAGE_SIZE) as Row[];

  const rawItems = db
    .prepare("SELECT id, name FROM item WHERE archived = 0 AND kind = 'raw' ORDER BY name")
    .all() as { id: number; name: string }[];
  const finishedItems = db
    .prepare("SELECT id, name FROM item WHERE archived = 0 AND kind = 'finished' ORDER BY name")
    .all() as { id: number; name: string }[];

  const columns: Column<Row>[] = [
    {
      header: "Formula",
      cell: (r) => (
        <Link href={`/formulas/${r.id}`} className="text-link font-medium">
          {r.name}
        </Link>
      ),
    },
    { header: "Output", cell: (r) => r.item_name },
    { header: "Components", cell: (r) => r.comps, num: true },
    { header: "Status", cell: (r) => <Badge neutral={r.active === 1}>{r.active ? "active" : "inactive"}</Badge> },
    {
      header: "",
      cell: (r) =>
        session.role === "admin" ? (
          <SetFormulaActiveButton id={r.id} active={r.active === 1} />
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Formulas"
        action={session.role === "admin" ? <NewFormulaButton rawItems={rawItems} finishedItems={finishedItems} /> : null}
      />
      <div className="mb-4">
        <SearchBar action="/formulas" placeholder="Search formulas…" q={query} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          query ? (
            <EmptyState title="No matches" hint={`Nothing found for “${query}”.`} />
          ) : (
            <EmptyState title="No formulas yet" hint="Create a bill of materials for a finished good." />
          )
        }
      />
      <Pagination page={p} totalPages={totalPages} basePath="/formulas" />
    </div>
  );
}
