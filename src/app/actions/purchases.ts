"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withRole, zodFieldErrors } from "@/lib/guard";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  receiveGoods,
} from "@/lib/purchase";

const lineSchema = z.object({
  item_id: z.coerce.number().int("Pick an item").positive("Pick an item"),
  qty: z.coerce.number({ error: "Required" }).positive("Must be greater than 0"),
  rate: z.coerce
    .number({ error: "Required" })
    .min(0, "Cannot be negative")
    .transform((v) => Math.round(v * 100)), // ₹ → paise
});

const createSchema = z.object({
  supplier_id: z.coerce.number().int("Pick a supplier").positive("Pick a supplier"),
  notes: z.string().trim().max(300).default(""),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

function readLines(formData: FormData) {
  const items = formData.getAll("line_item");
  const qtys = formData.getAll("line_qty");
  const rates = formData.getAll("line_rate");
  return items.map((item_id, i) => ({ item_id, qty: qtys[i], rate: rates[i] }));
}

export const createPurchaseOrderAction = withRole("operator", async (user, formData) => {
  const parsed = createSchema.safeParse({
    supplier_id: formData.get("supplier_id"),
    notes: formData.get("notes"),
    lines: readLines(formData),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const { poNo } = createPurchaseOrder({
    supplierId: d.supplier_id,
    lines: d.lines.map((l) => ({ itemId: l.item_id, qty: l.qty, ratePaise: l.rate })),
    notes: d.notes,
    userId: user.userId,
  });

  revalidatePath("/purchases");
  return { ok: true, toast: `${poNo} created` };
});

const receiveSchema = z.object({
  po_id: z.coerce.number().int().positive(),
  invoice_ref: z.string().trim().max(60).default(""),
});

export const receiveGoodsAction = withRole("operator", async (user, formData) => {
  const parsed = receiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  // Dynamic per-line inputs: recv_<itemId>
  const received: Record<string, number> = {};
  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("recv_")) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors[key] = "0 or more";
    } else {
      received[key.slice(5)] = Math.round(n * 1000) / 1000;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  receiveGoods({ poId: d.po_id, received, invoiceRef: d.invoice_ref, userId: user.userId });

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${d.po_id}`);
  return { ok: true, toast: "Goods received" };
});

const cancelSchema = z.object({ po_id: z.coerce.number().int().positive() });

export const cancelPoAction = withRole("operator", async (_user, formData) => {
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Order not found" };
  cancelPurchaseOrder(parsed.data.po_id);
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${parsed.data.po_id}`);
  return { ok: true, toast: "Order cancelled" };
});
