"use client";

import { useActionState, useState } from "react";
import { recordMovement } from "@/app/actions/inventory";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

export type ItemOption = { id: number; name: string; unit: string };

const TYPES = [
  ["receipt", "Receipt — stock in"],
  ["issue", "Issue — stock out"],
  ["return", "Return — stock back in"],
  ["adjustment", "Adjustment (+ add / − remove)"],
] as const;

export function RecordMovementButton({ items }: { items: ItemOption[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("receipt");
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(recordMovement, null);
  const [handled, setHandled] = useState<ActionState>(null);

  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  const err = state?.fieldErrors ?? {};

  return (
    <>
      <button className="btn-green" onClick={() => setOpen(true)}>
        + Record movement
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record stock movement">
        <form action={dispatch} className="space-y-4">
          <Field label="Item" error={err.item_id}>
            <Select name="item_id" defaultValue="" error={err.item_id}>
              <option value="" disabled>
                Pick an item…
              </option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Type" error={err.move_type}>
            <Select
              name="move_type"
              defaultValue="receipt"
              error={err.move_type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Quantity"
            hint={type === "adjustment" ? "Positive adds, negative removes" : undefined}
            error={err.qty}
          >
            <Input
              name="qty"
              type="number"
              step="0.001"
              min={type === "adjustment" ? undefined : "0"}
              placeholder={type === "adjustment" ? "e.g. -0.5" : "e.g. 12"}
              error={err.qty}
            />
          </Field>

          <Field
            label="Reason"
            hint={type === "adjustment" ? "Required for adjustments" : undefined}
            error={err.reason}
          >
            <Input name="reason" error={err.reason} placeholder="e.g. loading spillage" />
          </Field>

          {state?.error ? <p className="field-error">{state.error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="green" disabled={pending}>
              {pending ? "Recording…" : "Record"}
            </Button>
          </div>
        </form>
      </Modal>
      <Toast message={state?.ok ? state.toast : undefined} />
    </>
  );
}
