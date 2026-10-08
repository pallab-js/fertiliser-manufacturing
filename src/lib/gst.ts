import { db } from "@/db";
import { roundPaise } from "@/lib/money";

/** GST math (FR-024): per-line ₹ round → HSN+rate summary → CGST/SGST (intra)
 *  or IGST (inter) → invoice round-off to the nearest rupee, with the identity
 *  total = subtotal + cgst + sgst + igst + roundoff exactly. */

export type GstLine = {
  hsnCode: string;
  qty: number;
  ratePaise: number; // ₹ per unit, in paise
  gstRate: number; // 0 | 5 | 12 | 18
};

export type GstLineResult = { taxablePaise: number; taxPaise: number };

export type HsnSummaryRow = GstLineResult & { hsnCode: string; gstRate: number };

export type InvoiceTotals = {
  lines: GstLineResult[]; // aligned with input order
  hsnSummary: HsnSummaryRow[]; // HSN + rate groups (Σ = subtotal / total tax)
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundoffPaise: number;
  totalPaise: number;
};

export function computeInvoiceTotals(
  lines: GstLine[],
  taxMode: "intra" | "inter",
): InvoiceTotals {
  const results: GstLineResult[] = [];
  const groups = new Map<string, HsnSummaryRow>();
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const l of lines) {
    const taxable = roundPaise(l.qty * l.ratePaise);
    const tax = roundPaise((taxable * l.gstRate) / 100);
    results.push({ taxablePaise: taxable, taxPaise: tax });
    subtotal += taxable;
    if (taxMode === "intra") {
      const c = roundPaise(tax / 2); // remainder to SGST — matches seed
      cgst += c;
      sgst += tax - c;
    } else {
      igst += tax;
    }
    const key = `${l.hsnCode}|${l.gstRate}`;
    const g = groups.get(key) ?? {
      hsnCode: l.hsnCode,
      gstRate: l.gstRate,
      taxablePaise: 0,
      taxPaise: 0,
    };
    g.taxablePaise += taxable;
    g.taxPaise += tax;
    groups.set(key, g);
  }

  const raw = subtotal + cgst + sgst + igst;
  const total = Math.round(raw / 100) * 100; // round to nearest rupee (amounts ≥ 0)
  return {
    lines: results,
    hsnSummary: [...groups.values()],
    subtotalPaise: subtotal,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    roundoffPaise: total - raw,
    totalPaise: total,
  };
}

/** FR-024 amount in words — Indian lakh/crore numbering. */
export function amountInWords(paise: number): string {
  const ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const under100 = (n: number): string =>
    n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;

  const rupeesWords = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    let rest = n;
    const crore = Math.floor(rest / 10_000_000);
    rest %= 10_000_000;
    const lakh = Math.floor(rest / 100_000);
    rest %= 100_000;
    const thousand = Math.floor(rest / 1_000);
    rest %= 1_000;
    const hundred = Math.floor(rest / 100);
    rest %= 100;
    if (crore) parts.push(`${rupeesWords(crore)} Crore`);
    if (lakh) parts.push(`${under100(lakh)} Lakh`);
    if (thousand) parts.push(`${under100(thousand)} Thousand`);
    if (hundred) parts.push(`${ONES[hundred]} Hundred`);
    if (rest) parts.push(under100(rest));
    return parts.join(" ");
  };

  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  if (r === 0 && p === 0) return "Rupees Zero Only";
  if (r === 0) return `Rupees ${under100(p)} Paise Only`;
  const money = `Rupees ${rupeesWords(r)}`;
  return `${p > 0 ? `${money} and ${under100(p)} Paise` : money} Only`;
}

/** FR-025: unique sequential per FY — seq inside the caller's tx so a
 *  rollback never burns a number; UNIQUE(fy, seq) is the backstop. */
export function nextInvoiceNo(fy: string): { invoiceNo: string; seq: number } {
  const s = db
    .prepare("SELECT invoice_prefix FROM company_settings WHERE id = 1")
    .get() as { invoice_prefix: string } | undefined;
  const prefix = s?.invoice_prefix || "FERT";
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM invoice WHERE fy = ?")
    .get(fy) as { m: number };
  const seq = row.m + 1;
  return { invoiceNo: `${prefix}/${fy}/${String(seq).padStart(4, "0")}`, seq };
}
