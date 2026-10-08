"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { withRole, zodFieldErrors, type ActionState } from "@/lib/guard";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(120),
  address: z.string().trim().max(300).or(z.literal("")),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN (15 chars)"),
  state_code: z.string().trim().regex(/^[0-9]{2}$/, "2-digit state code"),
  state_name: z.string().trim().min(1, "State is required").max(60),
  invoice_prefix: z
    .string()
    .trim()
    .regex(/^[A-Z]{2,8}$/, "2–8 uppercase letters"),
  monthly_target_qty: z.coerce
    .number()
    .positive("Must be greater than 0")
    .max(10_000_000),
});

export const saveSettings = withRole("admin", async (_user, formData) => {
  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    gstin: formData.get("gstin"),
    state_code: formData.get("state_code"),
    state_name: formData.get("state_name"),
    invoice_prefix: formData.get("invoice_prefix"),
    monthly_target_qty: formData.get("monthly_target_qty"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const d = parsed.data;
  db.prepare(
    `UPDATE company_settings SET name = ?, address = ?, gstin = ?, state_code = ?,
       state_name = ?, invoice_prefix = ?, monthly_target_qty = ?
     WHERE id = 1`,
  ).run(
    d.name,
    d.address,
    d.gstin,
    d.state_code,
    d.state_name,
    d.invoice_prefix,
    d.monthly_target_qty,
  );

  revalidatePath("/", "layout");
  return { ok: true, toast: "Settings saved" };
});

export type { ActionState };
