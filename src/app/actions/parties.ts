"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { withRole, zodFieldErrors } from "@/lib/guard";

const partyKind = z.enum(["customer", "supplier"]);

const partySchema = z.object({
  party: partyKind,
  name: z.string().trim().min(1, "Name is required").max(120),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (v) => v === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v),
      "Invalid GSTIN (15 chars) or leave blank",
    )
    .default(""),
  state_code: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9]{2}$/.test(v), "2-digit state code or blank")
    .default(""),
  address: z.string().trim().max(300).default(""),
  phone: z.string().trim().max(20).default(""),
  email: z.string().trim().max(120).refine((v) => v === "" || v.includes("@"), "Invalid email").default(""),
});

/** Table is only ever "customer" | "supplier" (zod union) — safe to interpolate. */
function table(kind: "customer" | "supplier"): string {
  return kind;
}

const COLUMNS = "name, gstin, state_code, address, phone, email";

export const createParty = withRole("admin", async (_user, formData) => {
  const parsed = partySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const dup = db
    .prepare(`SELECT 1 FROM ${table(d.party)} WHERE archived = 0 AND lower(name) = lower(?)`)
    .get(d.name);
  if (dup) return { ok: false, fieldErrors: { name: "This name already exists" } };

  db.prepare(
    `INSERT INTO ${table(d.party)} (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(d.name, d.gstin, d.state_code, d.address, d.phone, d.email);
  revalidatePath(`/${d.party === "customer" ? "customers" : "suppliers"}`);
  return { ok: true, toast: `${d.name} added` };
});

export const updateParty = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Not found" };
  const parsed = partySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;

  const dup = db
    .prepare(
      `SELECT 1 FROM ${table(d.party)} WHERE archived = 0 AND lower(name) = lower(?) AND id != ?`,
    )
    .get(d.name, id);
  if (dup) return { ok: false, fieldErrors: { name: "This name already exists" } };

  const info = db
    .prepare(
      `UPDATE ${table(d.party)} SET ${COLUMNS},
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? AND archived = 0`,
    )
    .run(d.name, d.gstin, d.state_code, d.address, d.phone, d.email, id);
  if (info.changes === 0) return { ok: false, error: "Not found" };
  revalidatePath(`/${d.party === "customer" ? "customers" : "suppliers"}`);
  return { ok: true, toast: `${d.name} saved` };
});

/** FR-011: archive instead of delete. */
export const setPartyArchived = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id"));
  const archived = formData.get("archived") === "1" ? 1 : 0;
  const parsed = partyKind.safeParse(formData.get("party"));
  if (!parsed.success || !Number.isInteger(id) || id < 1)
    return { ok: false, error: "Not found" };

  db.prepare(
    `UPDATE ${table(parsed.data)} SET archived = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).run(archived, id);
  const base = parsed.data === "customer" ? "/customers" : "/suppliers";
  revalidatePath(base);
  revalidatePath(`${base}/${id}`);
  return { ok: true, toast: archived ? "Archived" : "Restored" };
});
