"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { withRole, zodFieldErrors } from "@/lib/guard";

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  kind: z.enum(["raw", "finished"], "Pick a kind"),
  unit: z.enum(["MT", "kg", "bags", "L"], "Pick a unit"),
  hsn_code: z.string().trim().max(20).optional().default(""),
  gst_rate: z.coerce
    .number()
    .refine((v) => [0, 5, 12, 18].includes(v), "Pick 0, 5, 12 or 18"),
  purchase_price: z.coerce.number().min(0, "Cannot be negative"), // ₹, stored as paise
  reorder_level: z.coerce.number().min(0, "Cannot be negative"),
});

function uniqueNameError(name: string, exceptId?: number): string | null {
  const row = db
    .prepare(
      `SELECT id FROM item WHERE archived = 0 AND lower(name) = lower(?) AND id != COALESCE(?, -1)`,
    )
    .get(name, exceptId ?? null) as { id: number } | undefined;
  return row ? "An active item with this name already exists" : null;
}

export const createItem = withRole("admin", async (_user, formData) => {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const dup = uniqueNameError(parsed.data.name);
  if (dup) return { ok: false, fieldErrors: { name: dup } };

  const d = parsed.data;
  db.prepare(
    `INSERT INTO item (name, kind, unit, hsn_code, gst_rate, purchase_price_paise, reorder_level)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    d.name,
    d.kind,
    d.unit,
    d.hsn_code,
    d.gst_rate,
    Math.round(d.purchase_price * 100),
    d.reorder_level,
  );
  revalidatePath("/items");
  return { ok: true, toast: `Item ${d.name} created` };
});

export const updateItem = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Item not found" };
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const dup = uniqueNameError(parsed.data.name, id);
  if (dup) return { ok: false, fieldErrors: { name: dup } };

  const d = parsed.data;
  const info = db
    .prepare(
      `UPDATE item SET name = ?, kind = ?, unit = ?, hsn_code = ?, gst_rate = ?,
         purchase_price_paise = ?, reorder_level = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? AND archived = 0`,
    )
    .run(
      d.name,
      d.kind,
      d.unit,
      d.hsn_code,
      d.gst_rate,
      Math.round(d.purchase_price * 100),
      d.reorder_level,
      id,
    );
  if (info.changes === 0) return { ok: false, error: "Item not found" };
  revalidatePath("/items");
  return { ok: true, toast: `${d.name} saved` };
});

/** FR-011: archive instead of delete (keeps all ledger references intact). */
export const setItemArchived = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id"));
  const archived = formData.get("archived") === "1" ? 1 : 0;
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Item not found" };

  db.prepare(
    "UPDATE item SET archived = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(archived, id);
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  return { ok: true, toast: archived ? "Item archived" : "Item restored" };
});
