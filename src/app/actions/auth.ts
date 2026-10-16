"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import {
  createSession,
  destroySession,
  issueSessionCookie,
  verifyPassword,
  SESSION_COOKIE,
} from "@/lib/auth";
import {
  cookieOptions,
  zodFieldErrors,
  type ActionState,
} from "@/lib/guard";
import { isLocked, recordFailure, reset } from "@/lib/rate-limit";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required").transform((s) => s.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export async function login(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const { username } = parsed.data;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim()
    || h.get("x-real-ip")
    || "unknown";
  const identifier = `${username}:${ip}`;

  const lock = isLocked(identifier);
  if (lock.locked)
    return { ok: false, error: `Too many failed attempts — try again in ${Math.ceil(lock.retryAfterMs / 60000)} minute(s).` };

  const user = db
    .prepare("SELECT id, password_hash, active FROM user WHERE username = ?")
    .get(username) as
    | { id: number; password_hash: string; active: number }
    | undefined;

  // Generic error — never reveal whether the account exists (FR-005)
  if (!user || user.active !== 1 || !verifyPassword(parsed.data.password, user.password_hash)) {
    recordFailure(identifier);
    return { ok: false, error: "Invalid username or password." };
  }

  reset(identifier);
  const sid = createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, issueSessionCookie(user.id, sid), {
    ...(await cookieOptions()),
    maxAge: 12 * 60 * 60,
  });
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (value) {
    const dot = value.lastIndexOf(".");
    if (dot > 0) {
      try {
        const { sid } = JSON.parse(
          Buffer.from(value.slice(0, dot), "base64url").toString("utf8"),
        ) as { sid: string };
        destroySession(sid);
      } catch {
        // tampered cookie — nothing to destroy
      }
    }
  }
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
