/** INR money as integer paise — never floats (TRD §5). */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,23,456.78 */
export function formatRupees(paise: number): string {
  return inr.format(paise / 100);
}

/** "1234.567" MT → paise-free quantity formatting with unit */
export function formatQty(qty: number, unit: string): string {
  return `${qty.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unit}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Round half away from zero — matches invoice line rounding rules. */
export function roundPaise(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}
