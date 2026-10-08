# Contracts: Server Actions (the only mutation surface)

**Feature**: 001-fertilizer-msme | **Date**: 2026-10-07

Every server action follows the same envelope — this is the app's UI contract:

```ts
type ActionResult<T> =
  | { ok: true; data: T; toast: string }        // FR-031 confirmation toast
  | { ok: false; fieldErrors?: Record<string, string>; error: string }  // FR-030
```

- **Guard**: `withRole('operator' | 'admin', action)` → auth session check + role check
  (FR-003). Admin-only actions are marked `admin`.
- **Validation**: zod schema per action, parsed server-side before any DB read/write.
- **Writes**: multi-statement writes in one transaction (constitution III).
- **Reads**: NOT actions — server components query `src/db/` directly.

| Action | Input (essentials) | Output | Role |
|---|---|---|---|
| `login` / `logout` | username, password | session cookie / cleared | public / any |
| `createUser`, `updateUser`, `resetPassword` | role, active | user id | admin |
| `saveCompanySettings` | name, gstin, state, invoice_prefix, target | ok | admin |
| `createItem`, `updateItem`, `archiveItem` | item fields | item id | admin |
| `createFormula`, `updateFormula`, `deactivateFormula` | components[] | formula id | admin |
| `upsertParty`, `archiveParty` | kind (cust/sup), fields | party id | admin |
| `recordMovement` | item, type, qty, reason?, ref? | balance_after | operator |
| `startBatch`, `completeBatch`, `cancelBatch` | formula, planned/actual consumption | batch_no, yield% | operator |
| `recordQcTest` | batch, parameters, result | qc id | operator |
| `createPurchaseOrder`, `receiveGoods`, `cancelPO` | lines / receipt lines | po_no / receipt id | operator |
| `createSalesOrder`, `updateSalesOrderLine`, `cancelSO` | customer, lines | so_no | operator |
| `issueInvoice` | so_id | invoice_no, totals | operator |
| `recordPayment` | invoice, amount, mode | new balance | operator |

**Derived contracts (pure functions, unit-tested):**

| Module | Signature (informal) | Contract |
|---|---|---|
| `lib/gst.ts` | `computeInvoiceTotals(lines, taxMode)` | HSN-wise taxable → CGST/SGST or IGST → per-line ₹ rounding → invoice round-off; sum of parts equals total exactly (SC-004) |
| `lib/gst.ts` | `amountInWords(paise)` | Indian numbering (lakh/crore), "Rupees … Only" |
| `lib/gst.ts` | `nextInvoiceNo(fy)` | allocated inside invoice tx; UNIQUE(fy, seq) backstop (FR-025) |
| `lib/stock.ts` | `applyMovement(item, qty, tx)` | rejects if balance would go < 0 (FR-013); returns balance_after |
| `lib/stock.ts` | `dispatchableQty(itemId)` | stock from batches with latest QC = pass (FR-018) |
| `lib/auth.ts` | `hashPassword` / `verifyPassword` | scrypt salted; constant-time compare |
| `lib/auth.ts` | `createSession` / `verifySessionCookie` | HMAC-signed; tampered/expired → null |

**Page-level contracts**: list pages accept `?q=&page=&filter` search params (FR-029);
role-gated routes (`/users`, `/settings`) render 403 for operators (FR-003).
