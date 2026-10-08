"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { withRole, zodFieldErrors } from "@/lib/guard";
import {
  cancelBatch,
  completeBatchTx,
  startBatch,
} from "@/lib/batch";

const startSchema = z.object({
  formula_id: z.coerce.number().int("Pick a formula").positive("Pick a formula"),
  planned_qty: z.coerce.number({ error: "Required" }).positive("Must be greater than 0"),
  notes: z.string().trim().max(300).default(""),
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const startBatchAction = withRole("operator", async (user, formData) => {
  const parsed = startSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const { batchNo } = startBatch({
    formulaId: d.formula_id,
    plannedQty: d.planned_qty,
    notes: d.notes,
    userId: user.userId,
  });

  revalidatePath("/production");
  return { ok: true, toast: `${batchNo} started` };
});

const completeSchema = z.object({
  batch_id: z.coerce.number().int().positive(),
  actual_qty: z.coerce.number({ error: "Required" }).min(0, "Cannot be negative"),
});

export const completeBatchAction = withRole("operator", async (user, formData) => {
  const parsed = completeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  // Dynamic per-item consumption inputs: act_<itemId>
  const actuals: Record<string, number> = {};
  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("act_")) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors[key] = "0 or more";
    } else {
      actuals[key.slice(4)] = r3(n);
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  completeBatchTx({
    batchId: d.batch_id,
    actuals,
    actualQty: d.actual_qty,
    userId: user.userId,
  });

  revalidatePath("/production");
  revalidatePath(`/production/${d.batch_id}`);
  return { ok: true, toast: "Batch completed" };
});

const cancelSchema = z.object({ batch_id: z.coerce.number().int().positive() });

export const cancelBatchAction = withRole("operator", async (_user, formData) => {
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Batch not found" };
  cancelBatch(parsed.data.batch_id);
  revalidatePath("/production");
  revalidatePath(`/production/${parsed.data.batch_id}`);
  return { ok: true, toast: "Batch cancelled" };
});

const qcSchema = z.object({
  batch_id: z.coerce.number().int().positive(),
  result: z.enum(["pass", "fail", "pending"], "Pick a result"),
  parameters: z
    .string()
    .trim()
    .default("{}")
    .refine(
      (v) => {
        if (v === "") return true;
        try {
          const p = JSON.parse(v);
          return typeof p === "object" && p !== null && !Array.isArray(p);
        } catch {
          return false;
        }
      },
      "Must be a JSON object, e.g. {\"moisture\": 2.1}",
    ),
  remarks: z.string().trim().max(300).default(""),
});

/** QC entry (FR-018): latest result wins — dispatchability follows the newest
 *  test per batch (see dispatchableQty in lib/stock). */
export const addQcTestAction = withRole("operator", async (user, formData) => {
  const parsed = qcSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const batch = db.prepare("SELECT 1 FROM batch WHERE id = ?").get(d.batch_id);
  if (!batch) return { ok: false, error: "Batch not found" };

  db.prepare(
    `INSERT INTO qc_test (batch_id, result, parameters, remarks, tested_by)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(d.batch_id, d.result, d.parameters || "{}", d.remarks, user.userId);

  revalidatePath("/production");
  revalidatePath(`/production/${d.batch_id}`);
  return { ok: true, toast: `QC recorded — ${d.result}` };
});
