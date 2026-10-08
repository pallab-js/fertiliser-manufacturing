"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withRole, zodFieldErrors } from "@/lib/guard";
import {
  cancelSalesOrder,
  createSalesOrder,
  issueInvoice,
  recordPayment,
} from "@/lib/sales";

const lineSchema = z.object({
  item_id: z.coerce.number().int("Pick an item").positive("Pick an item"),
  qty: z.coerce.number({ error: "Required" }).positive("Must be greater than 0"),
  rate: z.coerce
    .number({ error: "Required" })
    .min(0, "Cannot be negative")
    .transform((v) => Math.round(v * 100)), // ₹ → paise
});

const createSchema = z.object({
  customer_id: z.coerce.number().int("Pick a customer").positive("Pick a customer"),
  place_of_supply: z
    .string()
    .trim()
    .regex(/^[0-9]{2}$/, "Pick a place of supply"),
  notes: z.string().trim().max(300).default(""),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

function readLines(formData: FormData) {
  const items = formData.getAll("line_item");
  const qtys = formData.getAll("line_qty");
  const rates = formData.getAll("line_rate");
  return items.map((item_id, i) => ({ item_id, qty: qtys[i], rate: rates[i] }));
}

export const createSalesOrderAction = withRole("operator", async (user, formData) => {
  const parsed = createSchema.safeParse({
    customer_id: formData.get("customer_id"),
    place_of_supply: formData.get("place_of_supply"),
    notes: formData.get("notes"),
    lines: readLines(formData),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const { soNo } = createSalesOrder({
    customerId: d.customer_id,
    placeOfSupplyStateCode: d.place_of_supply,
    lines: d.lines.map((l) => ({ itemId: l.item_id, qty: l.qty, ratePaise: l.rate })),
    notes: d.notes,
    userId: user.userId,
  });

  revalidatePath("/sales");
  return { ok: true, toast: `${soNo} created` };
});

const idSchema = z.object({ so_id: z.coerce.number().int().positive() });

export const cancelSalesOrderAction = withRole("operator", async (user, formData) => {
  const parsed = idSchema.safeParse({ so_id: formData.get("so_id") });
  if (!parsed.success) return { ok: false, error: "Invalid order" };
  cancelSalesOrder(parsed.data.so_id);
  revalidatePath("/sales");
  revalidatePath(`/sales/${parsed.data.so_id}`);
  return { ok: true, toast: "Order cancelled" };
});

export const issueInvoiceAction = withRole("operator", async (user, formData) => {
  const parsed = idSchema.safeParse({ so_id: formData.get("so_id") });
  if (!parsed.success) return { ok: false, error: "Invalid order" };
  const { invoiceId, invoiceNo } = issueInvoice({ soId: parsed.data.so_id, userId: user.userId });
  revalidatePath("/sales");
  revalidatePath(`/sales/${parsed.data.so_id}`);
  revalidatePath(`/sales/invoices/${invoiceId}`);
  revalidatePath("/");
  return { ok: true, toast: `Invoice ${invoiceNo} issued` };
});

const paymentSchema = z.object({
  invoice_id: z.coerce.number().int().positive(),
  amount: z.coerce
    .number({ error: "Required" })
    .positive("Must be greater than 0")
    .transform((v) => Math.round(v * 100)), // ₹ → paise
  mode: z.enum(["cash", "upi", "bank", "cheque"]),
  notes: z.string().trim().max(200).default(""),
});

export const recordPaymentAction = withRole("operator", async (user, formData) => {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  recordPayment({
    invoiceId: d.invoice_id,
    amountPaise: d.amount,
    mode: d.mode,
    notes: d.notes,
    userId: user.userId,
  });

  revalidatePath(`/sales/invoices/${d.invoice_id}`);
  revalidatePath("/sales/receivables");
  revalidatePath("/");
  return { ok: true, toast: "Payment recorded" };
});
