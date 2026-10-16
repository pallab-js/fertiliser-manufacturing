/** In-memory login rate limiter (single-process LAN app).
 *
 * Tracks failed attempts per identifier (username + ip). After MAX_ATTEMPTS
 * failures within WINDOW_MS the identifier is locked out for LOCKOUT_MS.
 * State resets on a successful login. Not shared across processes — adequate
 * for the documented single-instance deployment; add Redis-backed limiting if
 * the app ever runs behind a multi-instance load balancer.
 */

type Record = { attempts: number; firstFail: number; lockedUntil: number };

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

const records = new Map<string, Record>();

function key(identifier: string): string {
  return `login:${identifier}`;
}

function now(): number {
  return Date.now();
}

export function recordFailure(identifier: string): void {
  const k = key(identifier);
  const rec = records.get(k) || { attempts: 0, firstFail: now(), lockedUntil: 0 };
  const t = now();
  if (t > rec.lockedUntil && t - rec.firstFail > WINDOW_MS) {
    // window expired — reset
    rec.attempts = 0;
    rec.firstFail = t;
    rec.lockedUntil = 0;
  }
  rec.attempts += 1;
  if (rec.attempts >= MAX_ATTEMPTS && rec.lockedUntil === 0) {
    rec.lockedUntil = t + LOCKOUT_MS;
  }
  records.set(k, rec);
}

export function reset(identifier: string): void {
  records.delete(key(identifier));
}

export function isLocked(identifier: string): { locked: boolean; retryAfterMs: number } {
  const rec = records.get(key(identifier));
  if (!rec) return { locked: false, retryAfterMs: 0 };
  const t = now();
  if (rec.lockedUntil > 0 && t < rec.lockedUntil) {
    return { locked: true, retryAfterMs: rec.lockedUntil - t };
  }
  if (t - rec.firstFail > WINDOW_MS) {
    records.delete(key(identifier));
  }
  return { locked: false, retryAfterMs: 0 };
}
