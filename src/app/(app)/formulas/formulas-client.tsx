"use client";

import { useActionState, useState } from "react";
import { saveFormula, setFormulaActive } from "@/app/actions/formulas";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

export type ItemOption = { id: number; name: string };
export type ComponentRow = { item_id: number; qty: number };

type Row = { key: number; item_id: string; qty: string };

type FormProps = {
  state: ActionState;
  dispatch: (formData: FormData) => void;
  pending: boolean;
  id?: number;
  initial?: { name: string; item_id: number; components: ComponentRow[] };
  rawItems: ItemOption[];
  finishedItems: ItemOption[];
};

/** Field markup + component rows; the parent owns the action state so it can
 *  close a modal on success (render-adjust in the same component). */
export function FormulaForm({ state, dispatch, pending, id, initial, rawItems, finishedItems }: FormProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.components.length
      ? initial.components.map((c, i) => ({ key: i, item_id: String(c.item_id), qty: String(c.qty) }))
      : [{ key: 0, item_id: "", qty: "" }],
  );
  const [nextKey, setNextKey] = useState(() => initial?.components.length ?? 1);
  const err = state?.fieldErrors ?? {};

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={dispatch} className="space-y-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}

      <Field label="Formula name" error={err.name}>
        <Input
          name="name"
          defaultValue={initial?.name}
          error={err.name}
          autoFocus={!initial}
          placeholder="NPK 19:19:19 Blend"
        />
      </Field>

      <Field label="Output (finished good)" error={err.item_id}>
        <Select name="item_id" defaultValue={initial ? String(initial.item_id) : ""}>
          <option value="" disabled>
            Pick an item…
          </option>
          {finishedItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>

      <div>
        <span className="field-label">Components (raw material per 1 unit output)</span>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex gap-2">
              <Select
                aria-label="Component item"
                value={r.item_id}
                onChange={(e) => setRow(r.key, { item_id: e.target.value })}
              >
                <option value="" disabled>
                  Item…
                </option>
                {rawItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Quantity"
                type="number"
                min="0"
                step="0.001"
                placeholder="qty"
                className="input max-w-32"
                value={r.qty}
                onChange={(e) => setRow(r.key, { qty: e.target.value })}
              />
              <button
                type="button"
                className="btn-ghost-sm"
                aria-label="Remove component"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
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
            setRows((rs) => [...rs, { key: nextKey, item_id: "", qty: "" }]);
            setNextKey((k) => k + 1);
          }}
        >
          + Add component
        </button>
        {err.components ? <p className="field-error">{err.components}</p> : null}
      </div>

      {state?.error ? <p className="field-error">{state.error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : "Create formula"}
        </Button>
      </div>
      <Toast message={state?.ok ? state.toast : undefined} />
    </form>
  );
}

export function NewFormulaButton({ rawItems, finishedItems }: { rawItems: ItemOption[]; finishedItems: ItemOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, _dispatch, pending] = useActionState<ActionState, FormData>(saveFormula, null);
  const [handled, setHandled] = useState<ActionState>(null);

  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button className="btn-green" onClick={() => setOpen(true)}>
        + New formula
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New formula">
        <div className="max-h-[70vh] overflow-y-auto">
          <FormulaForm
            state={state}
            dispatch={_dispatch}
            pending={pending}
            rawItems={rawItems}
            finishedItems={finishedItems}
          />
        </div>
      </Modal>
    </>
  );
}

export function EditFormula({
  id,
  initial,
  rawItems,
  finishedItems,
}: {
  id: number;
  initial: { name: string; item_id: number; components: ComponentRow[] };
  rawItems: ItemOption[];
  finishedItems: ItemOption[];
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(saveFormula, null);
  return (
    <FormulaForm
      state={state}
      dispatch={dispatch}
      pending={pending}
      id={id}
      initial={initial}
      rawItems={rawItems}
      finishedItems={finishedItems}
    />
  );
}

export function SetFormulaActiveButton({ id, active }: { id: number; active: boolean }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(setFormulaActive, null);
  return (
    <form
      action={dispatch}
      className="inline"
      onSubmit={(e) => {
        if (!window.confirm(active ? "Deactivate this formula?" : "Reactivate this formula?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <Button type="submit" variant="ghost-sm" disabled={pending}>
        {active ? "Deactivate" : "Reactivate"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}
