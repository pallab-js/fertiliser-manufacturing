"use client";

import { useActionState, useState } from "react";
import { createItem, setItemArchived, updateItem } from "@/app/actions/items";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

const KINDS = [
  ["raw", "Raw material"],
  ["finished", "Finished good"],
] as const;
const UNITS = ["MT", "kg", "bags", "L"] as const;
const GST_RATES = [0, 5, 12, 18];

export type ItemValues = {
  name: string;
  kind: string;
  unit: string;
  hsn_code: string;
  gst_rate: number;
  purchase_price: number; // ₹
  reorder_level: number;
};

/** Shared field markup for create + edit forms. */
function ItemFields({ state, initial }: { state: ActionState; initial?: ItemValues }) {
  const err = state?.fieldErrors ?? {};
  const v = initial;
  return (
    <>
      <Field label="Name" error={err.name}>
        <Input name="name" defaultValue={v?.name} error={err.name} placeholder="Urea (46% N)" autoFocus={!v} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Kind" error={err.kind}>
          <Select name="kind" defaultValue={v?.kind ?? "raw"}>
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Unit" error={err.unit}>
          <Select name="unit" defaultValue={v?.unit ?? "MT"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="HSN code" error={err.hsn_code}>
          <Input name="hsn_code" defaultValue={v?.hsn_code} error={err.hsn_code} placeholder="31021000" />
        </Field>
        <Field label="GST rate %" error={err.gst_rate}>
          <Select name="gst_rate" defaultValue={String(v?.gst_rate ?? 5)}>
            {GST_RATES.map((g) => (
              <option key={g} value={g}>{g}%</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Price (₹ per unit)" hint="Purchase price for raw, sale price for finished" error={err.purchase_price}>
          <Input
            name="purchase_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={v?.purchase_price}
            error={err.purchase_price}
          />
        </Field>
        <Field label="Reorder level" hint="Low-stock flag at or below this" error={err.reorder_level}>
          <Input
            name="reorder_level"
            type="number"
            min="0"
            step="0.01"
            defaultValue={v?.reorder_level}
            error={err.reorder_level}
          />
        </Field>
      </div>
      {state?.error ? (
        <p className="field-error" role="alert">{state.error}</p>
      ) : null}
    </>
  );
}

export function NewItemButton() {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(createItem, null);
  const [handled, setHandled] = useState<ActionState>(null);

  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button className="btn-green" onClick={() => setOpen(true)}>+ New item</button>
      <Modal open={open} onClose={() => setOpen(false)} title="New item">
        <form action={dispatch} className="space-y-4">
          <ItemFields state={state} />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="green" disabled={pending}>
              {pending ? "Creating…" : "Create item"}
            </Button>
          </div>
        </form>
      </Modal>
      <Toast message={state?.ok ? state.toast : undefined} />
    </>
  );
}

export function EditItemForm({ id, initial }: { id: number; initial: ItemValues }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(updateItem, null);
  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <ItemFields state={state} initial={initial} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}

export function ArchiveItemButton({ id, archived }: { id: number; archived: boolean }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(setItemArchived, null);
  return (
    <form action={dispatch} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <Button type="submit" variant="ghost-sm" disabled={pending}>
        {archived ? "Restore" : "Archive"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}
