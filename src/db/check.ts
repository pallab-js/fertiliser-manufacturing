import { pathToFileURL } from "node:url";
import { db } from "./index";
import { checkBalances } from "@/lib/stock";

/** SC-002 consistency check: latest balance_after == SUM(qty) per item.
 *  Exit 1 on any mismatch — usable as a gate in CI or cron. */
export function dbCheck(): boolean {
  const mismatches = checkBalances();
  const items = db
    .prepare("SELECT COUNT(*) AS n FROM item WHERE archived = 0")
    .get() as { n: number };
  const movements = db
    .prepare("SELECT COUNT(*) AS n FROM stock_movement")
    .get() as { n: number };
  if (mismatches.length) {
    console.error(`FAIL: ${mismatches.length} item balance(s) inconsistent:`);
    for (const m of mismatches)
      console.error(`  item ${m.itemId}: latest=${m.actual} sum=${m.expected}`);
    return false;
  }
  console.log(`OK: ${items.n} items, ${movements.n} movements, all balances consistent.`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!dbCheck()) process.exit(1);
}
