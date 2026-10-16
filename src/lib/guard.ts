import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { DomainError } from "@/db";
import {
  SESSION_COOKIE,
  verifySessionCookie,
  type SessionUser,
} from "@/lib/auth";

export type ActionState = {
  ok: boolean;
  toast?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionCookie(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Role-guarded server action for useActionState: (prevState, formData).
 *  role 'operator' = any authenticated user; 'admin' = admins only (FR-002/003). */
export function withRole(
  role: "admin" | "operator",
  fn: (user: SessionUser, formData: FormData) => Promise<ActionState>,
): (prev: ActionState, formData: FormData) => Promise<ActionState> {
  return async (_prev, formData) => {
    const session = await getSession();
    if (!session)
      return { ok: false, error: "Session expired — please sign in again." };
    if (role === "admin" && session.role !== "admin")
      return { ok: false, error: "You don't have permission for this action." };
    try {
      return await fn(session, formData);
    } catch (err) {
      if (err instanceof DomainError) return { ok: false, error: err.message };
      if (err && typeof err === "object" && "digest" in err) throw err; // Next redirect/error boundary
      console.error(`[${role} action failed]`, err);
      return {
        ok: false,
        error: "Something went wrong — nothing was saved. Please try again.",
      };
    }
  };
}

export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (key !== undefined) out[String(key)] = issue.message;
  }
  return out;
}

export async function cookieOptions() {
  const h = await headers();
  const isHttps = h.get("x-forwarded-proto") === "https";
  const isDev = process.env.NODE_ENV === "development";
  // Secure flag: required over HTTPS (HSTS enforces upgrade), optional override
  // via SESSION_COOKIE_SECURE=false for plain-HTTP local dev only.
  const secure =
    process.env.SESSION_COOKIE_SECURE === "false"
      ? false
      : isHttps || !isDev;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
  };
}
