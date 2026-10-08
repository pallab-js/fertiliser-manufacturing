"use client";

import { useActionState, useState } from "react";
import {
  cancelPoAction,
  createPurchaseOrderAction,
  receiveGoodsAction,
} from "@/app/actions/purchases";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

export type ItemOption = { id: number; name: string; unit: string };
export type SupplierOption = { id: number; name: string };

type Line = { key: number; item_id: string; qty: string; rate: string };

export function PoStatusBadge({ status }: { status: string }) {
  if (status === "open" || status === "partial") return <Badge>{status}</Badge>;
  return <Badge neutral>{status}</Badge>;
}

export function NewPoButton({
  items,
  suppliers,
}: {
  items: ItemOption[];
  suppliers: SupplierOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    createPurchaseOrderAction,
    null,
  );
  const [handled, setHandled] = useState<ActionState>(null);
  const [lines, setLines] = useState<Line[]>([
    { key: 0, item_id: "", qty: "", rate: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) {
      setOpen(false);
      setLines([{ key: 0, item_id: "", qty: "", rate: "" }]);
    }
  }

  const err = state?.fieldErrors ?? {};
  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <button className="btn-green" onClick={() => setOpen(true)}>
        + New PO
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New purchase order">
        <form action={dispatch} className="space-y-4">
          <Field label="Supplier" error={err.supplier_id}>
            <Select name="supplier_id" defaultValue="" error={err.supplier_id}>
              <option value="" disabled>
                Pick a supplier…
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <span className="field-label">Lines (rate ₹ per unit)</span>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="flex gap-2">
                  <Select
                    aria-label="Item"
                    value={l.item_id}
                    onChange={(e) => setLine(l.key, { item_id: e.target.value })}
                  >
                    <option value="" disabled>
                      Item…
                    </option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
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
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost-sm mt-2"
              onClick={() => {
                setLines((ls) => [...ls, { key: nextKey, item_id: "", qty: "", rate: "" }]);
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
              {pending ? "Creating…" : "Create PO"}
            </Button>
          </div>
        </form>
      </Modal>
      <Toast message={state?.ok ? state.toast : undefined} />
    </>
  );
}

export function ReceiveForm({
  poId,
  rows,
}: {
  poId: number;
  rows: { item_id: number; name: string; balance: number }[];
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    receiveGoodsAction,
    null,
  );
  const err = state?.fieldErrors ?? {};

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="po_id" value={poId} />
      <div className="panel-flat overflow-x-auto bg-surface-indigo p-6 text-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-hairline text-left text-ink/50">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 text-right font-medium">Balance</th>
              <th className="pb-2 text-right font-medium">Receiving</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_id} className="border-b border-hairline last:border-0">
                <td className="py-2">{r.name}</td>
                <td className="py-2 text-right tabular-nums text-ink/60">{r.balance}</td>
                <td className="py-2 text-right">
                  <Input
                    aria-label={`Receiving — ${r.name}`}
                    name={`recv_${r.item_id}`}
                    type="number"
                    min="0"
                    step="0.001"
                    defaultValue={0}
                    className="input ml-auto max-w-32 text-right tabular-nums"
                    error={err[`recv_${r.item_id}`]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Field label="Invoice ref" hint="Supplier invoice number (optional)">
        <Input name="invoice_ref" placeholder="e.g. INV-2291" />
      </Field>

      {state?.error ? <p className="field-error">{state.error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Receiving…" : "Receive goods"}
        </Button>
      </div>
      <Toast message={state?.ok ? state.toast : undefined} />
    </form>
  );
}

export function CancelPoButton({ poId }: { poId: number }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(cancelPoAction, null);
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this purchase order?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="po_id" value={poId} />
      <Button type="submit" variant="ghost-sm" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel order"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}
