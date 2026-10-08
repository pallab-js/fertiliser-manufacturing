# Feature Specification: Fertilizer MSME Manager

**Feature Branch**: `001-fertilizer-msme`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "A web app for managing a fertilizer manufacturing industry/factory MSME unit in India, with a central dashboard containing essential data visualizations/analytics, professional and clean, maximum user-friendliness. Modules: masters, inventory, production, QC, purchases, sales with GST invoicing, dashboard, admin/operator auth."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure sign-in and role-based access (Priority: P1)

The owner (admin) signs in and can do everything: manage users, change company settings, and
access every module. A staff member (operator) signs in and can record day-to-day transactions
across modules but cannot manage users or settings. Anyone signed out is redirected to the
sign-in page and cannot see any factory data.

**Why this priority**: Nothing in the system is usable or safe without authentication and the
two-role boundary. It is the foundation every other story builds on.

**Independent Test**: With only the sign-in feature built, an admin can log in and see the user
management screen, an operator can log in and is denied that screen, and an anonymous visitor
is bounced to sign-in from any page.

**Acceptance Scenarios**:

1. **Given** a valid admin account, **When** credentials are submitted, **Then** the admin lands
   in the app with access to all modules including user management.
2. **Given** a valid operator account, **When** credentials are submitted, **Then** the operator
   lands in the app but user management and settings routes return a "not allowed" result.
3. **Given** any signed-out visitor, **When** they open any app page, **Then** they are
   redirected to sign-in and see no data.
4. **Given** a signed-in user, **When** the session expires or they choose sign out, **Then**
   their cookie is invalidated and protected pages again require sign-in.
5. **Given** a wrong password, **When** credentials are submitted, **Then** a generic "invalid
   credentials" message is shown that does not reveal whether the username exists.

---

### User Story 2 - Central dashboard with analytics (Priority: P2)

The owner opens the dashboard and immediately sees the health of the unit: production this
month versus target, current stock of key raw materials and finished goods with low-stock
flags, recent sales value trend, purchase spend, QC pass rate, and pending receivables. Charts
are readable at a glance and every card links to the underlying module.

**Why this priority**: This is the headline value of the product — one screen the owner checks
daily. It can be demonstrated independently on seeded data before any transaction entry screen
is finished.

**Independent Test**: On a database seeded with demo transactions, the dashboard renders all
KPI cards and charts with correct numbers, and clicking a card navigates to its module.

**Acceptance Scenarios**:

1. **Given** seeded production, sales, purchase, and QC data, **When** the dashboard opens,
   **Then** all KPI cards and charts display values consistent with the underlying records.
2. **Given** an item whose stock is at or below its reorder level, **When** the dashboard
   renders, **Then** the item appears in the low-stock list with a visible warning treatment.
3. **Given** any period selector on the dashboard, **When** the period changes, **Then** charts
   re-render for the selected period (default: last 6 months).
4. **Given** a module card, **When** it is clicked, **Then** the user lands on the
   corresponding list page filtered to the relevant context.

---

### User Story 3 - Masters and inventory control (Priority: P3)

Admin maintains the master data: raw materials and finished goods (with unit, HSN code,
reorder level), formulas (bill of materials), customers, and suppliers. Operators record stock
movements — receipts, issues, returns, adjustments — and can always see the current stock
quantity and value for every item. Stock can never silently go negative.

**Why this priority**: Inventory is the spine of the factory: purchases push stock in,
production consumes and creates stock, sales pull stock out. Masters must exist before those
flows.

**Independent Test**: With only masters and inventory built, an admin creates an item and a
formula, an operator records receipts and issues, and the item's stock screen shows the correct
running balance that refuses to go below zero.

**Acceptance Scenarios**:

1. **Given** an item with 10 MT, **When** an operator records an issue of 12 MT, **Then** the
   system rejects the movement with a clear message and stock is unchanged.
2. **Given** a completed movement, **When** the item stock page is viewed, **Then** the balance
   equals the sum of all movements and the movement history shows the entry.
3. **Given** a customer or supplier referenced by a transaction, **When** admin tries to delete
   it, **Then** the system archives it instead of deleting, so history stays intact.
4. **Given** an item at or below its reorder level, **When** stock pages load, **Then** it is
   visually flagged as low stock.

---

### User Story 4 - Production batches with QC (Priority: P4)

An operator starts a production batch by choosing a formula and quantity; the system computes
the raw materials required. The operator records actual consumption and output, and the system
reports yield. A QC officer records test results for the batch; a failed or pending batch is
placed on hold and cannot be dispatched in sales.

**Why this priority**: Manufacturing is the core operation of the unit; it consumes raw
material (stock out) and produces finished goods (stock in), and QC gates what can be sold.

**Independent Test**: With production and QC built, an operator records a batch against a
formula, sees required versus actual consumption and yield, records a QC test, and a failed
batch is blocked from selection on a sales order.

**Acceptance Scenarios**:

1. **Given** a formula requiring 4 raw materials, **When** an operator selects it for a 10 MT
   batch, **Then** required quantities per material are shown before confirmation.
2. **Given** a batch with actual output less than input, **When** the batch is saved, **Then**
   yield percentage is displayed and raw materials are deducted, finished goods added, in one
   atomic operation.
3. **Given** a batch whose QC result is fail or pending, **When** a sales order line tries to
   use its finished goods, **Then** the batch is not offered for selection.
4. **Given** a passed batch, **When** QC is recorded as pass, **Then** its output becomes
   dispatchable stock.

---

### User Story 5 - Purchases and goods receipt (Priority: P5)

An operator records a purchase order to a supplier, then receives goods against it; the receipt
moves raw material into stock and captures purchase price for valuation. Purchase spend is
visible by period and by supplier.

**Why this priority**: Purchases are the inflow that keeps production running and feed the
dashboard's spend analytics.

**Independent Test**: With purchases built, an operator creates a purchase order, receives it
partially and then fully, and stock plus purchase-spend totals reflect exactly what was
received.

**Acceptance Scenarios**:

1. **Given** a purchase order for 20 MT, **When** 12 MT are received, **Then** stock increases
   by 12 MT and the order shows balance pending.
2. **Given** a fully received order, **When** a further receipt is attempted, **Then** it is
   rejected because nothing is pending.
3. **Given** receipts in a period, **When** the purchase report is opened, **Then** spend by
   period and by supplier matches the sum of receipts.

---

### User Story 6 - Sales orders and GST invoicing (Priority: P6)

An operator creates a sales order for a customer, selects QC-passed finished goods, and
generates a GST invoice (CGST/SGST or IGST per place of supply, HSN-wise amounts, round-off)
that can be printed. Dispatching the invoice reduces stock; payments received update
receivables.

**Why this priority**: Sales is the revenue flow; invoicing is a legal requirement in India and
the source of receivables on the dashboard.

**Independent Test**: With sales built, an operator creates an order, generates an invoice with
correct tax math, prints it, sees stock decrease, records a payment, and the receivable drops.

**Acceptance Scenarios**:

1. **Given** an intra-state customer order of ₹100,000 taxable value at 5% GST, **When** the
   invoice is generated, **Then** CGST and SGST are each ₹2,500 and the invoice total matches
   the sum of rounded line totals.
2. **Given** an interstate customer, **When** the invoice is generated, **Then** IGST applies
   instead of CGST/SGST.
3. **Given** an invoice, **When** print is invoked, **Then** a print-friendly invoice with
   company details, invoice number, HSN summary, and amount in words appears.
4. **Given** insufficient QC-passed stock, **When** an order line is added, **Then** the system
   warns and blocks confirmation.
5. **Given** a partial payment, **When** it is recorded, **Then** the outstanding balance for
   the customer decreases accordingly.

---

### User Story 7 - Operator day-to-day entry efficiency (Priority: P7)

An operator on the shop floor can complete routine entries (stock movement, batch, receipt,
order) quickly with sensible defaults, keyboard-friendly forms, immediate validation feedback,
and confirmation toasts; lists support search and filter so any record is findable in seconds.

**Why this priority**: Friendliness and speed determine whether the unit actually uses the
system daily; it layers on top of every module without changing their behavior.

**Independent Test**: A first-time operator, given only the on-screen labels, completes each
routine entry in one pass without asking for help, and finds a past record via search.

**Acceptance Scenarios**:

1. **Given** a list page, **When** a search term or filter is entered, **Then** results narrow
   immediately and an empty state explains how to clear filters.
2. **Given** an invalid form field, **When** the user submits, **Then** the field is highlighted
   with a specific message and no data is lost.
3. **Given** a successful save, **When** it completes, **Then** a toast confirms the action and
   the new record appears in the list.

---

### Edge Cases

- Two users save movements for the same item simultaneously — balances must remain exactly the
  sum of movements (serializable outcome, no lost updates).
- A formula is edited after a batch used it — historical batches keep the quantities as they
  were at production time.
- Stock adjustment pushes a balance negative — rejected with a message; corrections happen via
  explicit counter-entries.
- Invoice numbering must be gapless and unique per financial year; a failed save must not burn
  a number or leave a duplicate.
- Place of supply changes from intra- to interstate after lines are added — tax computation
  switches to IGST and recalculates before confirmation.
- Session expires while a form is half-filled — user is returned to sign-in and informed;
  no partial record is written.
- Database file unavailable or disk full mid-transaction — transaction rolls back, user sees a
  retryable error, no partial records.
- Finished goods with pending/failed QC exist in stock — they appear in stock reports but are
  never selectable for dispatch until passed.

## Requirements *(mandatory)*

### Functional Requirements

**Access & roles**

- **FR-001**: The system MUST authenticate users with username and password and maintain a
  server-verified session until sign-out or expiry.
- **FR-002**: The system MUST support exactly two roles: admin (all modules plus user
  management and company settings) and operator (all transactional modules and reports).
- **FR-003**: Every protected page and server mutation MUST reject unauthenticated or
  unauthorized requests with no data leakage.
- **FR-004**: Admin MUST be able to create, deactivate, and reset passwords of users and
  assign roles; the last active admin cannot be deactivated.
- **FR-005**: Failed sign-in attempts MUST show a generic error that does not reveal account
  existence.

**Dashboard**

- **FR-006**: The dashboard MUST show: production output vs target for the current month,
  stock summary with low-stock flags, sales-value trend, purchase spend, QC pass rate, and
  outstanding receivables.
- **FR-007**: Dashboard charts MUST support a period selector defaulting to the last 6 months.
- **FR-008**: Every dashboard card MUST link to the corresponding module list.

**Masters & inventory**

- **FR-009**: Admin MUST be able to manage items (raw material or finished good) with unit,
  HSN code, tax category, purchase price, and reorder level.
- **FR-010**: Admin MUST be able to manage formulas: a named finished good with its list of
  raw-material components and quantities per unit of output.
- **FR-011**: Admin MUST be able to manage customers and suppliers; referenced records are
  archived, never hard-deleted.
- **FR-012**: Operators MUST be able to record stock movements (receipt, issue, return,
  adjustment) with reason, and view per-item balance and movement history.
- **FR-013**: The system MUST prevent any movement that would drive a stock balance negative.
- **FR-014**: Stock balances MUST always equal the sum of recorded movements.

**Production & QC**

- **FR-015**: An operator MUST be able to open a batch by selecting a formula and planned
  output, with required raw-material quantities computed from the formula.
- **FR-016**: A batch MUST record actual consumption per material, actual output, date, and
  operator notes, and MUST display yield percentage.
- **FR-017**: Saving a batch MUST atomically deduct consumed raw materials and add produced
  finished goods to stock.
- **FR-018**: QC MUST record test results (pass/fail/pending) with measurable parameters per
  batch; failed or pending batches MUST be excluded from sales dispatch selection.
- **FR-019**: Historical batch records MUST preserve the formula quantities used at the time,
  even if the formula is later edited.

**Purchases**

- **FR-020**: An operator MUST be able to create a purchase order against a supplier with item
  lines, and receive goods fully or partially against it.
- **FR-021**: Goods receipt MUST increase raw-material stock atomically and store the purchase
  price for valuation.
- **FR-022**: Purchase spend MUST be reportable by period and by supplier, matching receipts.

**Sales & invoicing**

- **FR-023**: An operator MUST be able to create a sales order for a customer with
  QC-passed finished-goods lines and available-stock validation.
- **FR-024**: The system MUST generate a GST invoice with HSN-wise taxable value, CGST/SGST for
  intra-state and IGST for interstate supply based on place of supply, applicable rates,
  round-off, invoice total, and amount in words.
- **FR-025**: Invoice numbers MUST be unique and sequential per financial year.
- **FR-026**: Confirming an invoice MUST reduce finished-goods stock atomically.
- **FR-027**: Invoices MUST be printable in a clean print layout including company details,
  customer details, HSN summary, and tax breakdown.
- **FR-028**: Payments MUST be recordable against invoices, updating per-customer outstanding
  balances shown on the dashboard.

**Cross-cutting**

- **FR-029**: All list screens MUST support search and filtering, with helpful empty states.
- **FR-030**: All mutations MUST validate input server-side and show field-level errors on
  failure without losing entered data.
- **FR-031**: Successful mutations MUST show a confirmation toast.
- **FR-032**: All money MUST be in INR (₹) with two-decimal precision; quantities use
  configurable units (MT, kg, bags, litre).
- **FR-033**: The UI MUST follow the project's design guide derived from DESIGN.md: indigo
  canvas, Blurple primary actions, green reserved for the single highest-intent action,
  magenta accents, generously rounded cards, dark data tables.
- **FR-034**: The app MUST be usable on desktop and tablet widths (≥768px), with navigation
  collapsing sensibly on narrow screens.

### Key Entities

- **User**: account with username, password hash, role (admin/operator), active flag.
- **Company settings**: single record — name, address, GSTIN, state, logo, invoice prefix,
  targets — used on invoices and dashboard.
- **Item**: raw material or finished good; unit, HSN code, tax rate, purchase price, reorder
  level; archived flag.
- **Formula (BOM)**: finished good + component list (item, quantity per unit output);
  versioned usage in batches.
- **Stock movement**: item, type (receipt/issue/return/adjustment/batch-in/batch-out), quantity,
  reference document, timestamp, user.
- **Batch**: formula, planned/actual quantities, dates, status; preserves formula snapshot.
- **QC test**: batch, parameters, result (pass/fail/pending), tester, date.
- **Purchase order / receipt**: supplier, lines, ordered vs received quantities, price,
  status (open/partial/received).
- **Customer / Supplier**: name, GSTIN, state, address, contact; archived flag.
- **Sales order**: customer, lines (batch-linked finished goods), status.
- **Invoice**: sequential per financial year, tax breakdown, totals, status
  (unpaid/partial/paid), linked order and lines.
- **Payment**: invoice, amount, date, mode.
- **Audit-lite metadata**: created/updated timestamps and user on all transactions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator records a complete production batch (consumption, output, QC) in
  under 3 minutes on their second attempt.
- **SC-002**: At any time, every item's stock balance equals the sum of its movements —
  0 discrepancies across an automated consistency check run daily.
- **SC-003**: The dashboard loads with all charts within 2 seconds on a local network after
  6 months of seeded transaction volume.
- **SC-004**: An invoice is generated and ready to print in under 1 minute from order details,
  with tax math matching manual calculation on 10 spot-checked invoices.
- **SC-005**: 100% of unauthenticated or wrong-role access attempts to protected screens and
  mutations are rejected in a pre-release access test.
- **SC-006**: 9 of 10 first-time operators complete stock movement, batch, and invoice entry
  unaided within their first session.
- **SC-007**: Low-stock items are flagged before reaching zero in 100% of seeded low-stock
  scenarios on the dashboard and item lists.
- **SC-008**: No partial writes occur in forced mid-transaction failure tests — data state
  before and after is identical.

## Assumptions

- Single factory, single unit of account; multi-plant, multi-company out of scope for v1.
- Deployment is local (owner's machine or LAN server) with browser access; no cloud dependency
  required.
- Indian GST context: ₹ currency, HSN codes for fertilizers (e.g., 3102/3103/3105), CGST/SGST
  vs IGST by place of supply; e-invoice/IRN and e-way bills are out of scope for v1.
- Two roles only (admin, operator); fine-grained per-module permissions out of scope.
- UI language is English; unit names (MT, kg, bags) are configurable per item.
- Demo/seed data is provided for development and first-run walkthrough.
- Print-to-PDF via the browser replaces a PDF-generation library.
- Deferred from v1: payroll, full accounting ledger, barcode/QR, email/SMS notifications,
  report builder, multi-warehouse, FCO compliance document register.
