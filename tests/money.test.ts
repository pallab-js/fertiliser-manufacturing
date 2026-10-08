import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatRupees,
  roundPaise,
  rupeesToPaise,
  formatQty,
} from "../src/lib/money";
import { financialYear, lastNMonths, monthKey } from "../src/lib/dates";

test("formats INR in Indian grouping", () => {
  assert.equal(formatRupees(12345678), "₹1,23,456.78");
  assert.equal(formatRupees(0), "₹0.00");
  assert.equal(rupeesToPaise(432.15), 43215);
});

test("roundPaise rounds half away from zero", () => {
  assert.equal(roundPaise(10.5), 11);
  assert.equal(roundPaise(-10.5), -11);
  assert.equal(roundPaise(10.4), 10);
});

test("formatQty keeps it tidy", () => {
  assert.equal(formatQty(12.5, "MT"), "12.5 MT");
});

test("Indian financial year (Apr–Mar)", () => {
  assert.equal(financialYear(new Date("2026-04-01T00:00:00Z")), "26-27");
  assert.equal(financialYear(new Date("2026-03-31T00:00:00Z")), "25-26");
  assert.equal(financialYear(new Date("2026-10-07T00:00:00Z")), "26-27");
});

test("month helpers", () => {
  assert.equal(monthKey("2026-07-15T10:00:00Z"), "2026-07");
  assert.deepEqual(
    lastNMonths(3, new Date(2026, 9, 7)),
    ["2026-08", "2026-09", "2026-10"],
  );
});
