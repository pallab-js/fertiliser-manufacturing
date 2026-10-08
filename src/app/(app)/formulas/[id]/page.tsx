import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-parts";
import {
  EditFormula,
  SetFormulaActiveButton,
  type ComponentRow,
} from "../formulas-client";

export default async function FormulaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const { id } = await params;

  const formula = db
    .prepare(
      `SELECT f.id, f.name, f.item_id, f.active, i.name AS output_name
         FROM formula f JOIN item i ON i.id = f.item_id WHERE f.id = ?`,
    )
    .get(Number(id)) as
    | { id: number; name: string; item_id: number; active: number; output_name: string }
    | undefined;
  if (!formula) notFound();

  const components = db
    .prepare(
      `SELECT c.item_id, c.qty, i.name FROM formula_component c
         JOIN item i ON i.id = c.item_id WHERE c.formula_id = ? ORDER BY i.name`,
    )
    .all(formula.id) as (ComponentRow & { name: string })[];

  const rawItems = db
    .prepare("SELECT id, name FROM item WHERE archived = 0 AND kind = 'raw' ORDER BY name")
    .all() as { id: number; name: string }[];
  const finishedItems = db
    .prepare("SELECT id, name FROM item WHERE archived = 0 AND kind = 'finished' ORDER BY name")
    .all() as { id: number; name: string }[];

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={formula.name}
        action={
          session.role === "admin" ? (
            <SetFormulaActiveButton id={formula.id} active={formula.active === 1} />
          ) : null
        }
      />
      <p className="mb-4 text-sm text-ink/60">
        Output: {formula.output_name}{" "}
        {formula.active ? null : <Badge>inactive</Badge>}
      </p>

      {session.role === "admin" ? (
        <EditFormula
          id={formula.id}
          initial={{
            name: formula.name,
            item_id: formula.item_id,
            components: components.map((c) => ({ item_id: c.item_id, qty: c.qty })),
          }}
          rawItems={rawItems}
          finishedItems={finishedItems}
        />
      ) : (
        <ul className="panel-flat divide-y divide-hairline bg-surface-indigo p-6 text-sm">
          {components.map((c) => (
            <li key={c.item_id} className="flex justify-between py-2">
              <span>{c.name}</span>
              <span className="text-ink/70">{c.qty} MT</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
