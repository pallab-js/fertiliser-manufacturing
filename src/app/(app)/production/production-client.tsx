"use client";

import { useActionState, useState } from "react";
import {
  addQcTestAction,
  cancelBatchAction,
  completeBatchAction,
  startBatchAction,
} from "@/app/actions/production";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type FormulaOption = {
  id: number;
  name: string;
  output_name: string;
  components: { item_id: number; name: string; qty: number }[];
};

export function StatusBadge({ status }: { status: "open" | "completed" | "cancelled" }) {
  if (status === "open") return <Badge>open</Badge>;
  return <Badge neutral>{status}</Badge>;
}

/** fail → magenta HOLD (design: attention badges), pass/pending neutral. */
export function QcBadge({ result }: { result: string | null }) {
  if (result === "fail") return <Badge>HOLD</Badge>;
  if (result) return <Badge neutral>{result}</Badge>;
  return <span className="text-ink/40">—</span>;
}

export function NewBatchButton({ formulas }: { formulas: FormulaOption[] }) {
  const [open, setOpen] = useState(false);
  const [fid, setFid] = useState("");
  const [planned, setPlanned] = useState("");
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    startBatchAction,
    null,
  );
  const [handled, setHandled] = useState<ActionState>(null);

  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) {
      setOpen(false);
      setFid("");
      setPlanned("");
    }
  }

  const err = state?.fieldErrors ?? {};
  const formula = formulas.find((f) => String(f.id) === fid);
  const qty = Number(planned);
  const showPreview = Boolean(formula) && Number.isFinite(qty) && qty > 0;

  return (
    <>
      <button className="btn-green" onClick={() => setOpen(true)}>
        + New batch
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Start batch">
        <form action={dispatch} className="space-y-4">
          <Field label="Formula" error={err.formula_id}>
            <Select name="formula_id" value={fid} onChange={(e) => setFid(e.target.value)} error={err.formula_id}>
              <option value="" disabled>
                Pick a formula…
              </option>
              {formulas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} → {f.output_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Planned output (MT)" error={err.planned_qty}>
            <Input
              name="planned_qty"
              type="number"
              min="0.001"
              step="0.001"
              placeholder="e.g. 10"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              error={err.planned_qty}
            />
          </Field>

          {showPreview ? (
            <div className="panel-flat bg-surface-indigo p-4 text-sm">
              <p className="field-label">Required materials</p>
              <table className="w-full">
                <tbody>
                  {formula!.components.map((c) => (
                    <tr key={c.item_id} className="border-b border-hairline last:border-0">
                      <td className="py-1.5">{c.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{r3(c.qty * qty)} MT</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <Field label="Notes" error={err.notes}>
            <Input name="notes" placeholder="Optional" error={err.notes} />
          </Field>

          {state?.error ? <p className="field-error">{state.error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="green" disabled={pending || !fid || !(qty > 0)}>
              {pending ? "Starting…" : "Start batch"}
            </Button>
          </div>
        </form>
      </Modal>
      <Toast message={state?.ok ? state.toast : undefined} />
    </>
  );
}

export function CompleteBatchForm({
  batchId,
  rows,
  plannedQty,
}: {
  batchId: number;
  rows: { item_id: number; name: string; planned_qty: number }[];
  plannedQty: number;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    completeBatchAction,
    null,
  );
  const err = state?.fieldErrors ?? {};

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="batch_id" value={batchId} />
      <div className="panel-flat overflow-x-auto bg-surface-indigo p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-ink/50">
              <th className="pb-2 font-medium">Component</th>
              <th className="pb-2 text-right font-medium">Planned</th>
              <th className="pb-2 text-right font-medium">Actual used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_id} className="border-b border-hairline last:border-0">
                <td className="py-2">{r.name}</td>
                <td className="py-2 text-right tabular-nums text-ink/60">{r.planned_qty}</td>
                <td className="py-2 text-right">
                  <Input
                    aria-label={`Actual used — ${r.name}`}
                    name={`act_${r.item_id}`}
                    type="number"
                    min="0"
                    step="0.001"
                    defaultValue={r.planned_qty}
                    className="input ml-auto max-w-32 text-right tabular-nums"
                    error={err[`act_${r.item_id}`]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Field label="Actual yield (MT)" error={err.actual_qty}>
        <Input
          name="actual_qty"
          type="number"
          min="0"
          step="0.001"
          defaultValue={plannedQty}
          className="input max-w-40 tabular-nums"
          error={err.actual_qty}
        />
      </Field>

      {state?.error ? <p className="field-error">{state.error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Completing…" : "Complete batch"}
        </Button>
      </div>
      <Toast message={state?.ok ? state.toast : undefined} />
    </form>
  );
}

export function CancelBatchButton({ batchId }: { batchId: number }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    cancelBatchAction,
    null,
  );
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this batch? It cannot be resumed.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="batch_id" value={batchId} />
      <Button type="submit" variant="ghost-sm" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel batch"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}

export function AddQcForm({ batchId }: { batchId: number }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    addQcTestAction,
    null,
  );
  const err = state?.fieldErrors ?? {};

  return (
    <form action={dispatch} className="space-y-4" aria-label="Add QC test">
      <input type="hidden" name="batch_id" value={batchId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Result" error={err.result}>
          <Select name="result" defaultValue="pending" error={err.result}>
            <option value="pending">pending</option>
            <option value="pass">pass</option>
            <option value="fail">fail</option>
          </Select>
        </Field>
        <Field label="Remarks" error={err.remarks}>
          <Input name="remarks" placeholder="e.g. lab run 2" error={err.remarks} />
        </Field>
      </div>
      <Field
        label="Parameters (JSON)"
        hint='e.g. {"moisture": 2.1, "granule_strength": 3.4, "npk_assay": 19.1}'
        error={err.parameters}
      >
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            className="btn-ghost-sm text-xs"
            onClick={() => {
              // Find the input and set its value
              const el = document.querySelector('input[name="parameters"]');
              if (el) (el as HTMLInputElement).value = JSON.stringify({ moisture: 2.1, granule_strength: 3.4, npk_assay: 19.1 });
            }}
          >
            NPK example
          </button>
          <button
            type="button"
            className="btn-ghost-sm text-xs"
            onClick={() => {
              const el = document.querySelector('input[name="parameters"]');
              if (el) (el as HTMLInputElement).value = JSON.stringify({ moisture: 1.8, granule_strength: 2.9, ph: 6.8 });
            }}
          >
            Urea example
          </button>
        </div>
        <Input name="parameters" defaultValue="{}" className="input font-mono" error={err.parameters} />
      </Field>
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Record test"}
        </Button>
      </div>
      <Toast message={state?.ok ? state.toast : undefined} />
    </form>
  );
}
