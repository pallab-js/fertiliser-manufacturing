"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, inTx } from "@/db";
import { withRole, zodFieldErrors } from "@/lib/guard";

const formulaSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  item_id: z.coerce.number().int("Pick an output item").positive("Pick an output item"),
  components: z
    .array(
      z.object({
        item_id: z.coerce.number().int("Pick an item").positive("Pick an item"),
        qty: z.coerce.number({ error: "Required" }).positive("Must be greater than 0"),
      }),
    )
    .min(1, "Add at least one component"),
});

function readFormData(formData: FormData) {
  const items = formData.getAll("comp_item");
  const qtys = formData.getAll("comp_qty");
  return {
    name: formData.get("name"),
    item_id: formData.get("item_id"),
    components: items.map((item_id, i) => ({ item_id, qty: qtys[i] })),
  };
}

/** Shared validation for create/update. Returns field errors or normalized data. */
function validate(raw: ReturnType<typeof readFormData>) {
  const parsed = formulaSchema.safeParse(raw);
  if (!parsed.success) return { errors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const out = db.prepare("SELECT kind FROM item WHERE id = ? AND archived = 0").get(d.item_id) as
    | { kind: string }
    | undefined;
  if (!out) return { errors: { item_id: "Output item not found" } };
  if (out.kind !== "finished")
    return { errors: { item_id: "Output must be a finished good" } };

  const seen = new Set<number>();
  for (const c of d.components) {
    const row = db
      .prepare("SELECT kind FROM item WHERE id = ? AND archived = 0")
      .get(c.item_id) as { kind: string } | undefined;
    if (!row) return { errors: { components: "Component item not found" } };
    if (row.kind !== "raw") return { errors: { components: "Components must be raw materials" } };
    if (seen.has(c.item_id)) return { errors: { components: "Duplicate component" } };
    seen.add(c.item_id);
  }
  return { data: d };
}

function replaceComponents(formulaId: number, comps: { item_id: number; qty: number }[]): void {
  db.prepare("DELETE FROM formula_component WHERE formula_id = ?").run(formulaId);
  const insert = db.prepare(
    "INSERT INTO formula_component (formula_id, item_id, qty) VALUES (?, ?, ?)",
  );
  for (const c of comps) insert.run(formulaId, c.item_id, c.qty);
}

export const saveFormula = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id")); // 0 = create
  const result = validate(readFormData(formData));
  if ("errors" in result) return { ok: false, fieldErrors: result.errors };
  const d = result.data;

  inTx(() => {
    if (id > 0) {
      const info = db
        .prepare(
          `UPDATE formula SET name = ?, item_id = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        )
        .run(d.name, d.item_id, id);
      if (info.changes === 0) throw new Error("Formula not found");
      replaceComponents(id, d.components);
    } else {
      const newId = Number(
        db
          .prepare("INSERT INTO formula (item_id, name) VALUES (?, ?)")
          .run(d.item_id, d.name).lastInsertRowid,
      );
      replaceComponents(newId, d.components);
    }
  });

  revalidatePath("/formulas");
  return { ok: true, toast: id > 0 ? `${d.name} saved` : `Formula ${d.name} created` };
});

/** Deactivate instead of delete — batches keep referencing history. */
export const setFormulaActive = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1" ? 1 : 0;
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Not found" };

  db.prepare(
    "UPDATE formula SET active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(active, id);
  revalidatePath("/formulas");
  revalidatePath(`/formulas/${id}`);
  return { ok: true, toast: active ? "Formula reactivated" : "Formula deactivated" };
});
