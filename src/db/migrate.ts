import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type Database from "better-sqlite3";
import { db } from "./index";

/** Apply numbered .sql migrations in order, tracked by PRAGMA user_version.
 *  Never edit an applied migration — add a new numbered file. */
export function runMigrations(conn: Database.Database = db): number {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let current = Number(conn.pragma("user_version", { simple: true }));
  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (Number.isNaN(version)) throw new Error(`Bad migration name: ${file}`);
    if (version <= current) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    conn.exec("BEGIN");
    try {
      conn.exec(sql);
      conn.pragma(`user_version = ${version}`);
      conn.exec("COMMIT");
    } catch (err) {
      conn.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err}`);
    }
    current = version;
  }
  return current;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const v = runMigrations();
  console.log(`Migrated. user_version=${v}`);
}
