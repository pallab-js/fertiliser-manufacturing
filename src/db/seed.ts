import { pathToFileURL } from "node:url";
import { db, inTx } from "./index";
import { runMigrations } from "./migrate";
import { hashPassword } from "@/lib/auth";
import { applyMovement, balanceFor, checkBalances } from "@/lib/stock";

/** Demo data: masters + Apr–Oct 2026 transactions (SC-003/SC-006).
 *  Every stock write goes through the app's own guards, so bad math fails
 *  the seed loudly instead of shipping an inconsistent demo ledger. */

const NOW = new Date("2026-10-07T10:00:00Z");
const FY = "26-27";
const iso = (month: number, day: number) =>
  `${NOW.getUTCFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

type Row = { id: number };

function insert(sql: string, ...args: unknown[]): number {
  return Number(db.prepare(sql).run(...(args as never[])).lastInsertRowid);
}

export function seed(): void {
  runMigrations();
  if ((db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }).n > 0) {
    console.log("Already seeded — delete data/noter.db to reseed.");
    return;
  }

  const item: Record<string, number> = {};
  const formulaId: Record<string, number> = {};
  const cust: Record<string, number> = {};
  const sup: Record<string, number> = {};

  /* ---------- masters ---------- */
  inTx(() => {
    insert(
      "INSERT INTO user (username, password_hash, role) VALUES (?, ?, 'admin')",
      "admin",
      hashPassword("admin123"),
    );
    insert(
      "INSERT INTO user (username, password_hash, role) VALUES (?, ?, 'operator')",
      "operator",
      hashPassword("operator123"),
    );
    db.prepare(
      `INSERT INTO company_settings (id, name, address, gstin, state_code, state_name,
        invoice_prefix, monthly_target_qty) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "Bharat Agro Fertilizers",
      "Plot 14, MIDC Industrial Area, Nashik, Maharashtra 422010",
      "27ABCDE1234F1Z5",
      "27",
      "Maharashtra",
      "FERT",
      16,
    );

    const raw = (name: string, hsn: string, gst: number, price: number) =>
      insert(
        `INSERT INTO item (name, kind, unit, hsn_code, gst_rate, purchase_price_paise)
         VALUES (?, 'raw', 'MT', ?, ?, ?)`,
        name, hsn, gst, price * 100,
      );
    item["Urea"] = raw("Urea (46% N)", "31021000", 5, 28_000);
    item["Ammonium Sulphate"] = raw("Ammonium Sulphate", "31022100", 5, 24_000);
    item["DAP"] = raw("Di-ammonium Phosphate (DAP)", "31039010", 5, 43_000);
    item["MOP"] = raw("Muriate of Potash (MOP)", "31042010", 5, 34_000);
    item["Bentonite"] = raw("Bentonite Filler", "25084000", 5, 6_000);
    item["Zinc Sulphate"] = raw("Zinc Sulphate (Micronutrient)", "28332930", 12, 32_000);

    const fin = (name: string, hsn: string, price: number) =>
      insert(
        `INSERT INTO item (name, kind, unit, hsn_code, gst_rate, purchase_price_paise)
         VALUES (?, 'finished', 'MT', ?, 5, ?)`,
        name, hsn, price * 100,
      );
    item["NPK 19:19:19"] = fin("NPK 19:19:19", "31052000", 36_000);
    item["NPK 12:32:16"] = fin("NPK 12:32:16", "31052000", 38_000);
    item["Complex 20:20:0:13"] = fin("Complex 20:20:0:13", "31052000", 35_000);
    item["Organic Manure"] = fin("Organic Manure", "31010000", 13_000);

    const mkFormula = (name: string, out: string, comps: [string, number][]) => {
      const fid = insert("INSERT INTO formula (item_id, name) VALUES (?, ?)", item[out], name);
      for (const [rawName, qty] of comps)
        insert(
          "INSERT INTO formula_component (formula_id, item_id, qty) VALUES (?, ?, ?)",
          fid, item[rawName], qty,
        );
      return fid;
    };
    formulaId["F1"] = mkFormula("NPK 19:19:19 Blend", "NPK 19:19:19", [
      ["Urea", 0.3], ["DAP", 0.42], ["MOP", 0.26], ["Bentonite", 0.02],
    ]);
    formulaId["F2"] = mkFormula("NPK 12:32:16", "NPK 12:32:16", [
      ["Urea", 0.25], ["DAP", 0.72], ["Bentonite", 0.03],
    ]);
    formulaId["F3"] = mkFormula("Complex 20:20:0:13", "Complex 20:20:0:13", [
      ["Urea", 0.35], ["Ammonium Sulphate", 0.3], ["MOP", 0.32], ["Zinc Sulphate", 0.03],
    ]);

    for (const [name, gstin, state, phone] of [
      ["Shri Krishna Traders", "27AAACS1234A1Z5", "27", "9822011234"],
      ["Kisan Agro Centre", "27AAAKK5678B1Z2", "27", "9822022345"],
      ["GreenFields Farms Pvt Ltd", "37AABCG9876C1Z9", "07", "9849033456"],
      ["Malwa Distributors", "23AABCM4321D1Z7", "23", "9826044567"],
    ] as const)
      cust[name] = insert(
        "INSERT INTO customer (name, gstin, state_code, phone) VALUES (?, ?, ?, ?)",
        name, gstin, state, phone,
      );

    for (const [name, gstin, state] of [
      ["National Chemical Suppliers", "27AABCN1111E1Z1", "27"],
      ["Gujarat Minerals & Chemicals", "24AABCG2222F1Z4", "24"],
      ["Deccan Agri Inputs", "27AABCD3333G1Z8", "27"],
    ] as const)
      sup[name] = insert(
        "INSERT INTO supplier (name, gstin, state_code) VALUES (?, ?, ?)",
        name, gstin, state,
      );
  });

  const adminId = (db.prepare("SELECT id FROM user WHERE username = 'admin'").get() as Row).id;
  const opId = (db.prepare("SELECT id FROM user WHERE username = 'operator'").get() as Row).id;
  const priceOf = (id: number) =>
    (db.prepare("SELECT purchase_price_paise AS p FROM item WHERE id = ?").get(id) as { p: number }).p;

  /* ---------- transactions ---------- */
  let poNo = 0;
  let soNo = 0;
  let batchNo = 0;
  let invSeq = 0;

  const receivePo = (supplier: string, lines: [string, number][], on: string) => {
    poNo += 1;
    const poId = insert(
      "INSERT INTO purchase_order (po_no, supplier_id, status, created_by) VALUES (?, ?, 'received', ?)",
      `PO/${FY}/${String(poNo).padStart(4, "0")}`, sup[supplier], opId,
    );
    const recId = insert(
      "INSERT INTO purchase_receipt (po_id, received_at, created_by) VALUES (?, ?, ?)",
      poId, on, opId,
    );
    for (const [rawName, qty] of lines) {
      const price = priceOf(item[rawName]);
      insert(
        "INSERT INTO purchase_line (po_id, item_id, qty, rate_paise) VALUES (?, ?, ?, ?)",
        poId, item[rawName], qty, price,
      );
      insert(
        "INSERT INTO purchase_receipt_line (receipt_id, item_id, qty, rate_paise) VALUES (?, ?, ?, ?)",
        recId, item[rawName], qty, price,
      );
      applyMovement({
        itemId: item[rawName], moveType: "receipt", qty,
        refType: "purchase_receipt", refId: recId, createdBy: opId,
      });
    }
  };

  const batchBal = new Map<number, number>(); // finished-good stock per batch
  const batchItem = new Map<number, string>();
  const batchPassed = new Set<number>();

  const completeBatch = (fKey: string, qty: number, on: string, qc: "pass" | "fail") => {
    const fid = formulaId[fKey];
    const outItem = (db.prepare("SELECT item_id AS i FROM formula WHERE id = ?").get(fid) as { i: number }).i;
    const outName = (db.prepare("SELECT name AS n FROM item WHERE id = ?").get(outItem) as { n: string }).n;
    const comps = db
      .prepare("SELECT item_id AS i, qty AS q FROM formula_component WHERE formula_id = ?")
      .all(fid) as { i: number; q: number }[];

    batchNo += 1;
    const batchId = insert(
      `INSERT INTO batch (batch_no, formula_id, planned_qty, actual_qty, status, started_at, completed_at, created_by)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)`,
      `BATCH/${FY}/${String(batchNo).padStart(4, "0")}`, fid, qty, qty, on, on, opId,
    );
    for (const c of comps) {
      const used = Math.round(c.q * qty * 1000) / 1000;
      insert(
        `INSERT INTO batch_consumption (batch_id, item_id, planned_qty, actual_qty)
         VALUES (?, ?, ?, ?)`,
        batchId, c.i, used, used,
      );
      applyMovement({
        itemId: c.i, moveType: "batch_out", qty: used,
        refType: "batch", refId: batchId, batchId, createdBy: opId,
      });
    }
    applyMovement({
      itemId: outItem, moveType: "batch_in", qty,
      refType: "batch", refId: batchId, batchId, createdBy: opId,
    });
    insert(
      `INSERT INTO qc_test (batch_id, result, parameters, tested_by, tested_at)
       VALUES (?, ?, ?, ?, ?)`,
      batchId, qc,
      JSON.stringify({ moisture: 2.1, granule_strength: 3.4, npk_assay: 19.1 }),
      opId, on,
    );
    batchBal.set(batchId, qty);
    batchItem.set(batchId, outName);
    if (qc === "pass") batchPassed.add(batchId);
  };

  const sell = (
    customer: string,
    lines: [string, number][],
    on: string,
    paid: "full" | "partial" | "none",
  ) => {
    const c = db
      .prepare("SELECT state_code AS s FROM customer WHERE id = ?")
      .get(cust[customer]) as { s: string };
    const companyState = (db.prepare("SELECT state_code AS s FROM company_settings WHERE id = 1").get() as { s: string }).s;
    const taxMode = c.s === companyState ? "intra" : "inter";
    soNo += 1;
    const soId = insert(
      `INSERT INTO sales_order (so_no, customer_id, place_of_supply_state_code, tax_mode, status, created_by)
       VALUES (?, ?, ?, ?, 'invoiced', ?)`,
      `SO/${FY}/${String(soNo).padStart(4, "0")}`, cust[customer], c.s, taxMode, opId,
    );

    let subtotal = 0, cgst = 0, sgst = 0, igst = 0;
    const lineRows: {
      item: number; batch: number; name: string; hsn: string; unit: string;
      qty: number; rate: number; gst: number; taxable: number; tax: number;
    }[] = [];

    for (const [finName, qty] of lines) {
      // Oldest completed, QC-passed batch that still holds the full line qty
      const pick = [...batchBal.entries()]
        .filter(([b, bal]) => bal >= qty - 1e-9 && batchPassed.has(b) && batchItem.get(b) === finName)
        .map(([b, bal]) => ({
          b,
          bal,
          done: (db.prepare("SELECT completed_at AS c FROM batch WHERE id = ?").get(b) as { c: string }).c,
        }))
        .filter((c) => c.done <= on)
        .sort((a, b) => (a.done < b.done ? -1 : a.done > b.done ? 1 : a.b - b.b))[0];
      if (!pick)
        throw new Error(`Seed: no dispatchable batch of ${finName} holds ${qty} MT by ${on}`);
      const batchId = pick.b;
      const bal = pick.bal;
      const meta = db
        .prepare("SELECT id, hsn_code AS h, unit, gst_rate AS g, purchase_price_paise AS p FROM item WHERE id = ?")
        .get(item[finName]) as { id: number; h: string; unit: string; g: number; p: number };
      const taxable = Math.round(qty * meta.p);
      const tax = Math.round((taxable * meta.g) / 100);
      insert(
        "INSERT INTO sales_order_line (so_id, item_id, batch_id, qty, rate_paise, gst_rate) VALUES (?, ?, ?, ?, ?, ?)",
        soId, meta.id, batchId, qty, meta.p, meta.g,
      );
      subtotal += taxable;
      if (taxMode === "intra") {
        cgst += Math.round(tax / 2);
        sgst += tax - Math.round(tax / 2);
      } else {
        igst += tax;
      }
      lineRows.push({
        item: meta.id, batch: batchId, name: finName, hsn: meta.h, unit: meta.unit,
        qty, rate: meta.p, gst: meta.g, taxable, tax,
      });
      batchBal.set(batchId, bal - qty);
      applyMovement({
        itemId: meta.id, moveType: "sale", qty, batchId,
        refType: "sales_order", refId: soId, createdBy: opId,
      });
    }

    invSeq += 1;
    const total = subtotal + cgst + sgst + igst;
    const invoiceId = insert(
      `INSERT INTO invoice (invoice_no, fy, seq, so_id, customer_id, tax_mode,
        place_of_supply_state_code, invoice_date, subtotal_paise, cgst_paise, sgst_paise,
        igst_paise, total_paise, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
      `FERT/${FY}/${String(invSeq).padStart(4, "0")}`, FY, invSeq, soId, cust[customer],
      taxMode, c.s, on, subtotal, cgst, sgst, igst, total, opId,
    );
    for (const l of lineRows) {
      insert(
        `INSERT INTO invoice_line (invoice_id, item_id, batch_id, description, hsn_code, qty, unit,
           rate_paise, gst_rate, taxable_paise, tax_paise)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        invoiceId, l.item, l.batch, l.name, l.hsn, l.qty, l.unit,
        l.rate, l.gst, l.taxable, l.tax,
      );
    }
    if (paid !== "none") {
      const amount = paid === "full" ? total : Math.round(total * 0.6);
      insert(
        "INSERT INTO payment (invoice_id, amount_paise, paid_at, mode, created_by) VALUES (?, ?, ?, 'bank', ?)",
        invoiceId, amount, on, opId,
      );
      db.prepare("UPDATE invoice SET status = ? WHERE id = ?").run(
        paid === "full" ? "paid" : "partial", invoiceId,
      );
    }
  };

  inTx(() => {
    /* April: opening purchases sized to leave realistic closing stock */
    receivePo("National Chemical Suppliers", [["Urea", 30], ["DAP", 36]], iso(4, 5));
    receivePo("Deccan Agri Inputs", [["Ammonium Sulphate", 14], ["Bentonite", 3], ["Zinc Sulphate", 1.5]], iso(4, 6));
    receivePo("Gujarat Minerals & Chemicals", [["MOP", 18]], iso(4, 20));

    /* 12 batches across 6 months; batch #7 (i=6) fails QC for pass-rate realism */
    const monthPlan: [number, number][] = [
      [4, 10], [5, 8], [5, 22], [6, 9], [6, 24], [7, 8],
      [7, 22], [8, 7], [8, 21], [9, 6], [9, 20], [10, 3],
    ];
    const fKeys = ["F1", "F2", "F3", "F1", "F3", "F2", "F1", "F2", "F3", "F1", "F2", "F3"];
    monthPlan.forEach(([m, d], i) => {
      completeBatch(fKeys[i], 6 + (i % 4), iso(m, d), i === 6 ? "fail" : "pass");
    });

    /* Top-up purchases across suppliers (purchase-spend report variety) */
    receivePo("National Chemical Suppliers", [["Urea", 6]], iso(6, 2));
    receivePo("Deccan Agri Inputs", [["Bentonite", 1]], iso(8, 3));
    receivePo("Gujarat Minerals & Chemicals", [["MOP", 6]], iso(9, 2));

    /* Sales: pool-checked quantities (intra + inter, paid + unpaid) */
    sell("Shri Krishna Traders", [["NPK 19:19:19", 5], ["NPK 12:32:16", 4]], iso(5, 12), "full");
    sell("Kisan Agro Centre", [["NPK 12:32:16", 3], ["Complex 20:20:0:13", 4]], iso(5, 27), "full");
    sell("Shri Krishna Traders", [["NPK 19:19:19", 6]], iso(6, 15), "full");
    sell("GreenFields Farms Pvt Ltd", [["Complex 20:20:0:13", 6]], iso(6, 28), "partial");
    sell("Malwa Distributors", [["Complex 20:20:0:13", 4]], iso(7, 10), "partial");
    sell("Kisan Agro Centre", [["NPK 12:32:16", 5]], iso(7, 25), "full");
    sell("Shri Krishna Traders", [["NPK 12:32:16", 8]], iso(8, 26), "full");
    sell("GreenFields Farms Pvt Ltd", [["Complex 20:20:0:13", 6]], iso(8, 26), "none");
    sell("Kisan Agro Centre", [["NPK 19:19:19", 4]], iso(9, 11), "partial");
    sell("Malwa Distributors", [["NPK 19:19:19", 2], ["NPK 12:32:16", 5]], iso(9, 24), "none");
    sell("Shri Krishna Traders", [["Complex 20:20:0:13", 3]], iso(10, 4), "none");

    /* Reorder levels set against actual closing balances so the demo reliably
       shows a realistic low-stock mix (SC-007). */
    const lowNow = ["MOP", "Zinc Sulphate", "Bentonite", "NPK 12:32:16"];
    const all = [...lowNow, "Urea", "DAP", "Ammonium Sulphate", "NPK 19:19:19", "Complex 20:20:0:13", "Organic Manure"];
    for (const name of all) {
      const bal = Math.max(balanceFor(item[name]), 0);
      const reorder = lowNow.includes(name) ? bal + 2 : Math.floor(bal * 0.5);
      db.prepare("UPDATE item SET reorder_level = ? WHERE id = ?").run(reorder, item[name]);
    }

    const mismatches = checkBalances();
    if (mismatches.length)
      throw new Error(`Seed ledger inconsistent: ${JSON.stringify(mismatches)}`);
    void adminId;
  });

  console.log(
    `Seeded: users=admin/operator, items=${Object.keys(item).length}, batches=${batchNo}, ` +
    `invoices=${invSeq}, purchases=${poNo}, sales_orders=${soNo}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed();
}
