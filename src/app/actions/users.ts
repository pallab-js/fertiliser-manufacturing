"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, inTx } from "@/db";
import { hashPassword } from "@/lib/auth";
import { withRole, zodFieldErrors } from "@/lib/guard";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(30)
    .regex(/^[a-z0-9._-]+$/, "Lowercase letters, digits, . _ - only")
    .transform((s) => s.toLowerCase()),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(["admin", "operator"], "Pick a role"),
});

export const createUser = withRole("admin", async (_user, formData) => {
  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success)
    return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const exists = db
    .prepare("SELECT 1 FROM user WHERE username = ?")
    .get(parsed.data.username);
  if (exists)
    return { ok: false, fieldErrors: { username: "Username already taken" } };

  db.prepare(
    "INSERT INTO user (username, password_hash, role) VALUES (?, ?, ?)",
  ).run(parsed.data.username, hashPassword(parsed.data.password), parsed.data.role);

  revalidatePath("/users");
  return { ok: true, toast: `User ${parsed.data.username} created` };
});

/** Deactivate (never delete) — FR-004. Re-activate sets active back to 1. */
export const setUserActive = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1" ? 1 : 0;
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Bad user" };

  const target = db.prepare("SELECT role FROM user WHERE id = ?").get(id) as
    | { role: string }
    | undefined;
  if (!target) return { ok: false, error: "User not found" };

  if (active === 0 && target.role === "admin") {
    const admins = db
      .prepare("SELECT COUNT(*) AS n FROM user WHERE role = 'admin' AND active = 1")
      .get() as { n: number };
    const self = db.prepare("SELECT active FROM user WHERE id = ?").get(id) as
      | { active: number }
      | undefined;
    if (admins.n <= 1 && self?.active === 1)
      return { ok: false, error: "Cannot deactivate the last active admin." };
  }

  inTx(() => {
    db.prepare("UPDATE user SET active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(active, id);
    if (active === 0)
      db.prepare("DELETE FROM session WHERE user_id = ?").run(id); // immediate kill
  });
  revalidatePath("/users");
  return { ok: true, toast: active ? "User reactivated" : "User deactivated" };
});

export const resetPassword = withRole("admin", async (_user, formData) => {
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { ok: false, fieldErrors: { password: "At least 8 characters" } };
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Bad user" };

  db.prepare(
    "UPDATE user SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(hashPassword(password), id);
  db.prepare("DELETE FROM session WHERE user_id = ?").run(id); // force re-login
  revalidatePath("/users");
  return { ok: true, toast: "Password reset — that user must sign in again" };
});
