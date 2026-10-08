"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, inTx } from "@/db";
import { applyMovement } from "@/lib/stock";
import { withRole, zodFieldErrors } from "@/lib/guard";

const MANUAL_TYPES = ["receipt", "issue", "return", "adjustment"] as const;

const movementSchema = z
  .object({
    item_id: z.coerce.number().int("Pick an item").positive("Pick an item"),
    move_type: z.enum(MANUAL_TYPES, "Pick a type"),
    qty: z.coerce
      .number({ error: "Required" })
      .refine((v) => v !== 0, "Cannot be zero"),
    reason: z.string().trim().max(300).default(""),
  })
  .superRefine((d, ctx) => {
    if (d.move_type === "adjustment") {
      if (!d.reason)
        ctx.addIssue({ code: "custom", path: ["reason"], message: "Reason is required for adjustments" });
    } else if (d.qty < 0) {
      ctx.addIssue({ code: "custom", path: ["qty"], message: "Must be greater than zero" });
    }
  });

/** Manual stock entry (FR-012): receipt/issue/return magnitudes, adjustment
 *  signed (+ found / − lost) with a mandatory reason. Goes through
 *  applyMovement, so negative balances are rejected (FR-013). */
export const recordMovement = withRole("operator", async (user, formData) => {
  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const balance = inTx(() =>
    applyMovement({
      itemId: d.item_id,
      moveType: d.move_type,
      qty: d.qty,
      reason: d.reason || undefined,
      createdBy: user.userId,
    }),
  );

  revalidatePath("/inventory");
  return {
    ok: true,
    toast: `Recorded — new balance ${Number(balance.toFixed(3))} ${unitFor(d.item_id)}`,
  };
});

function unitFor(itemId: number): string {
  const row = db.prepare("SELECT unit FROM item WHERE id = ?").get(itemId) as
    | { unit: string }
    | undefined;
  return row?.unit ?? "";
}
