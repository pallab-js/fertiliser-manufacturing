"use client";

import { useActionState, useState } from "react";
import {
  cancelSalesOrderAction,
  createSalesOrderAction,
  issueInvoiceAction,
  recordPaymentAction,
} from "@/app/actions/sales";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { STATES } from "@/lib/states";
import type { ActionState } from "@/lib/guard";

export type SoCustomer = { id: number; name: string };
export type SoItemOption = {
  id: number;
  name: string;
  unit: string;
  gstRate: number;
  priceRupees: number;
  dispatchable: number;
};

export function SoStatusBadge({ status }: { status: string }) {
  if (status === "draft" || status === "confirmed") return <Badge>{status}</Badge>;
  return <Badge neutral>{status}</Badge>;
}

type Line = { key: number; item_id: string; qty: string; rate: string };

const emptyLine = (key: number): Line => ({ key, item_id: "", qty: "", rate: "" });

export function NewSoButton({
  customers,
  items,
  companyStateCode,
}: {
  customers: SoCustomer[];
  items: SoItemOption[];
  companyStateCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    createSalesOrderAction,
    null,
  );
  const [handled, setHandled] = useState<ActionState>(null);
  const [customerId, setCustomerId] = useState("");
  const [pos, setPos] = useState(companyStateCode);
  const [posFilter, setPosFilter] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine(0)]);
  const [nextKey, setNextKey] = useState(1);

  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) {
      setOpen(false);
      setCustomerId("");
      setPos(companyStateCode);
      setLines([emptyLine(0)]);
    }
  }

  const err = state?.fieldErrors ?? {};
  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const intra = pos === companyStateCode;

  // Per-line stock warnings: pure function of lines + items (computed at render).
  const lineWarnings: Record<number, string> = {};
  for (const l of lines) {
    const item = items.find((i) => String(i.id) === l.item_id);
    const qty = Number(l.qty);
    if (item && Number.isFinite(qty) && qty > 0 && qty > item.dispatchable) {
      lineWarnings[l.key] = `Only ${item.dispatchable} ${item.unit} dispatchable — requested ${qty}`;
    }
  }

  return (
    <>
      <button className="btn-green" onClick={() => setOpen(true)}>
        + New order
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New sales order">
        <form action={dispatch} className="space-y-4">
          <Field label="Customer" error={err.customer_id}>
            <Select
              name="customer_id"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              error={err.customer_id}
            >
              <option value="" disabled>
                Pick a customer…
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Place of supply"
            hint={intra ? "Intra-state · CGST + SGST" : "Inter-state · IGST"}
          >
            <Input
              type="text"
              placeholder="Filter states…"
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="max-w-xs mb-2"
            />
            <Select
              name="place_of_supply"
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              error={err.place_of_supply}
            >
              {STATES.filter((s) =>
                `${s.code} ${s.name}`.toLowerCase().includes(posFilter.toLowerCase()),
              )
                .slice(0, 20)
                .map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              {posFilter && STATES.filter((s) =>
                `${s.code} ${s.name}`.toLowerCase().includes(posFilter.toLowerCase()),
              ).length > 20 ? (
                <option disabled>
                  … more matches (keep typing to narrow)
                </option>
              ) : null}
            </Select>
          </Field>

          <div>
            <span className="field-label">Lines (rate ₹ per unit)</span>
            <div className="space-y-2">
              {lines.map((l) => {
                const item = items.find((i) => String(i.id) === l.item_id);
                return (
                  <div key={l.key} className="flex gap-2">
                    <Select
                      aria-label="Item"
                      value={l.item_id}
                      onChange={(e) => {
                        const picked = items.find((i) => String(i.id) === e.target.value);
                        setLine(l.key, {
                          item_id: e.target.value,
                          rate: picked ? String(picked.priceRupees) : "",
                        });
                      }}
                    >
                      <option value="" disabled>
                        Item…
                      </option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {i.dispatchable} {i.unit} free
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="qty"
                      className="max-w-28"
                      value={l.qty}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    />
                    <Input
                      aria-label="Rate"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="₹ rate"
                      className="max-w-28"
                      value={l.rate}
                      onChange={(e) => setLine(l.key, { rate: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn-ghost-sm"
                      aria-label="Remove line"
                      onClick={() =>
                        setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))
                      }
                    >
                      ✕
                    </button>
                    {item ? (
                      <span className="self-center text-xs text-ink/40">GST {item.gstRate}%</span>
                    ) : null}
                    {lineWarnings[l.key] ? (
                      <span className="self-center text-xs text-magenta" role="alert">
                        {lineWarnings[l.key]}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="btn-ghost-sm mt-2"
              onClick={() => {
                setLines((ls) => [...ls, emptyLine(nextKey)]);
                setNextKey((k) => k + 1);
              }}
            >
              + Add line
            </button>
            {err.lines ? <p className="field-error">{err.lines}</p> : null}
          </div>

          <Field label="Notes" error={err.notes}>
            <Input name="notes" placeholder="Optional" error={err.notes} />
          </Field>

          {state?.error ? <p className="field-error">{state.error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="green" disabled={pending}>
              {pending ? "Creating…" : "Create order"}
            </Button>
          </div>
        </form>
      </Modal>
      <Toast message={state?.ok ? state.toast : undefined} />
    </>
  );
}

export function IssueInvoiceButton({ soId }: { soId: number }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    issueInvoiceAction,
    null,
  );
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (!window.confirm("Issue the GST invoice? Stock will be reduced.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="so_id" value={soId} />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Issuing…" : "Issue GST invoice"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}

export function CancelSoButton({ soId }: { soId: number }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    cancelSalesOrderAction,
    null,
  );
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this sales order?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="so_id" value={soId} />
      <Button type="submit" variant="ghost-sm" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel order"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}

export function RecordPaymentForm({ invoiceId }: { invoiceId: number }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    recordPaymentAction,
    null,
  );
  const err = state?.fieldErrors ?? {};

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Amount ₹" error={err.amount}>
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            error={err.amount}
          />
        </Field>
        <Field label="Mode">
          <Select name="mode" defaultValue="bank">
            <option value="bank">Bank</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
          </Select>
        </Field>
        <Field label="Notes">
          <Input name="notes" placeholder="Optional" />
        </Field>
      </div>
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
      </div>
      <Toast message={state?.ok ? state.toast : undefined} />
    </form>
  );
}

export function PrintButton() {
  return (
    <button className="btn-ghost-sm no-print" onClick={() => window.print()}>
      Print
    </button>
  );
}
