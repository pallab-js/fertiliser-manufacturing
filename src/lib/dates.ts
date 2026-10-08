/** Dates: ISO-8601 UTC strings in the DB, Indian financial year helpers. */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Indian financial year for a date, e.g. 2026-07-15 → "26-27" */
export function financialYear(date: Date = new Date()): string {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1; // FY starts April
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

/** Month key for dashboard grouping, e.g. "2026-07" */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Last N months (oldest first) ending in the month of `from`, e.g. ["2026-05","2026-06","2026-07"] */
export function lastNMonths(n: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
