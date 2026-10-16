import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/** Single SQLite file for the whole app. Tests override via NOTER_DB. */
const dbPath =
  process.env.NOTER_DB ?? path.join(process.cwd(), "data", "noter.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma("synchronous = NORMAL");

/** All multi-statement writes go through here (constitution III).
 *  Nested calls use SAVEPOINTs so lib functions compose inside one outer tx. */
let savepointSeq = 0;

export function inTx<T>(fn: () => T): T {
  if (db.inTransaction) {
    const sp = `sp_${savepointSeq++}`;
    db.exec(`SAVEPOINT ${sp}`);
    try {
      const result = fn();
      db.exec(`RELEASE ${sp}`);
      return result;
    } catch (err) {
      db.exec(`ROLLBACK TO ${sp}`);
      db.exec(`RELEASE ${sp}`);
      throw err;
    }
  }
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export class DomainError extends Error {}

/** Run `fn` (which computes a unique number + inserts) and retry on a UNIQUE
 *  constraint failure, recomputing the number each attempt. number generators
 *  (nextSoNo/nextPoNo/nextBatchNo/nextInvoiceNo) are pure computes; the caller
 *  wraps compute+insert here so a concurrent writer can't steal the number. */
export function withUniqueRetry<T>(fn: () => T, maxRetries = 10): T {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("SQLITE_CONSTRAINT_UNIQUE") ||
        msg.includes("UNIQUE constraint failed")
      ) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
