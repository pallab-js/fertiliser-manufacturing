import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "@/db";

export const SESSION_COOKIE = "fm_session";
const SESSION_HOURS = 12;
const SLIDING_THRESHOLD_MS = 6 * 60 * 60 * 1000; // extend when <6h left

/* ---------------- password (scrypt, docs/security.md §2) ---------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ---------------- session secret ---------------- */

function sessionSecret(): Buffer {
  if (process.env.SESSION_SECRET) return Buffer.from(process.env.SESSION_SECRET, "utf8");
  // Dev/local convenience: random per-install secret, file 600, inside gitignored data/.
  const file = path.join(process.cwd(), "data", ".session-secret");
  try {
    return fs.readFileSync(file);
  } catch {
    const secret = randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/* ---------------- cookie value ---------------- */

export function issueSessionCookie(userId: number, sid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sid, uid: userId, exp: Date.now() + SESSION_HOURS * 3600_000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionCookie(value: string | undefined): SessionUser | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { sid: string; uid: number; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (Date.now() > parsed.exp) return null;

  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.active, s.expires_at
         FROM session s JOIN user u ON u.id = s.user_id
        WHERE s.id = ? AND s.user_id = ?`,
    )
    .get(parsed.sid, parsed.uid) as
    | { id: number; username: string; role: "admin" | "operator"; active: number; expires_at: string }
    | undefined;
  if (!row || row.active !== 1) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  // Sliding expiry: extend only when less than half the lifetime remains.
  if (Date.parse(row.expires_at) - Date.now() < SLIDING_THRESHOLD_MS) {
    db.prepare("UPDATE session SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString(),
      parsed.sid,
    );
  }
  return { userId: row.id, username: row.username, role: row.role, sessionId: parsed.sid };
}

/* ---------------- session rows ---------------- */

export function createSession(userId: number): string {
  const sid = randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    sid,
    userId,
    new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString(),
  );
  return sid;
}

export function destroySession(sid: string): void {
  db.prepare("DELETE FROM session WHERE id = ?").run(sid);
}

export function destroyUserSessions(userId: number): void {
  db.prepare("DELETE FROM session WHERE user_id = ?").run(userId);
}

export type SessionUser = {
  userId: number;
  username: string;
  role: "admin" | "operator";
  sessionId: string;
};

/** Password policy for password creation (create/reset): min 8 chars, at
 *  least one letter and one digit. */
export function passwordSchema(label = "Password") {
  return z
    .string()
    .min(8, `${label} must be at least 8 characters`)
    .regex(/[A-Za-z]/, `${label} must contain at least one letter`)
    .regex(/\d/, `${label} must contain at least one digit`);
}
