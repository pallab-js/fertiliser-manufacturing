"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, inTx } from "@/db";
import { hashPassword, passwordSchema } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withRole, zodFieldErrors } from "@/lib/guard";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(30)
    .regex(/^[a-z0-9._-]+$/, "Lowercase letters, digits, . _ - only")
    .transform((s) => s.toLowerCase()),
  password: passwordSchema(),
  role: z.enum(["admin", "operator"], "Pick a role"),
});

export const createUser = withRole("admin", async (user, formData) => {
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

  await audit({
    actorUserId: user.userId,
    actorUsername: user.username,
    action: "create",
    entityType: "user",
    after: { username: parsed.data.username, role: parsed.data.role },
  });

  revalidatePath("/users");
  return { ok: true, toast: `User ${parsed.data.username} created` };
});

/** Deactivate (never delete) — FR-004. Re-activate sets active back to 1. */
export const setUserActive = withRole("admin", async (user, formData) => {
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1" ? 1 : 0;
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Bad user" };

  const target = db
    .prepare("SELECT role, active FROM user WHERE id = ?")
    .get(id) as { role: string; active: number } | undefined;
  if (!target) return { ok: false, error: "User not found" };
  const beforeActive = target.active;

  if (active === 0 && target.role === "admin") {
    const admins = db
      .prepare("SELECT COUNT(*) AS n FROM user WHERE role = 'admin' AND active = 1")
      .get() as { n: number };
    if (admins.n <= 1 && beforeActive === 1)
      return { ok: false, error: "Cannot deactivate the last active admin." };
  }

  inTx(() => {
    db.prepare(
      "UPDATE user SET active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(active, id);
    if (active === 0)
      db.prepare("DELETE FROM session WHERE user_id = ?").run(id); // immediate kill
  });

  await audit({
    actorUserId: user.userId,
    actorUsername: user.username,
    action: active === 1 ? "reactivate" : "deactivate",
    entityType: "user",
    entityId: id,
    before: { active: beforeActive },
    after: { active },
  });

  revalidatePath("/users");
  return { ok: true, toast: active ? "User reactivated" : "User deactivated" };
});

export const resetPassword = withRole("admin", async (user, formData) => {
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  const pw = passwordSchema().safeParse(password);
  if (!pw.success)
    return {
      ok: false,
      fieldErrors: { password: pw.error.issues[0]?.message ?? "Invalid password" },
    };
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Bad user" };

  db.prepare(
    "UPDATE user SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(hashPassword(password), id);
  db.prepare("DELETE FROM session WHERE user_id = ?").run(id); // force re-login

  await audit({
    actorUserId: user.userId,
    actorUsername: user.username,
    action: "password_reset",
    entityType: "user",
    entityId: id,
    after: { passwordReset: true },
  });

  revalidatePath("/users");
  return { ok: true, toast: "Password reset — that user must sign in again" };
});
