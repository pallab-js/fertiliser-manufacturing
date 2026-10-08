"use client";

import { useActionState } from "react";
import { saveSettings } from "@/app/actions/settings";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

type Settings = {
  name: string;
  address: string;
  gstin: string;
  state_code: string;
  state_name: string;
  invoice_prefix: string;
  monthly_target_qty: number;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(saveSettings, null);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={dispatch} className="max-w-xl space-y-5">
      <Field label="Company name" error={err.name}>
        <Input name="name" defaultValue={initial.name} error={err.name} />
      </Field>
      <Field label="Address" error={err.address}>
        <Input name="address" defaultValue={initial.address} error={err.address} />
      </Field>
      <Field label="GSTIN" hint="15-character GST number on invoices" error={err.gstin}>
        <Input name="gstin" defaultValue={initial.gstin} error={err.gstin} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="State code" hint="e.g. 27" error={err.state_code}>
          <Input name="state_code" defaultValue={initial.state_code} error={err.state_code} />
        </Field>
        <Field label="State name" error={err.state_name}>
          <Input name="state_name" defaultValue={initial.state_name} error={err.state_name} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Invoice prefix" hint="e.g. FERT" error={err.invoice_prefix}>
          <Input name="invoice_prefix" defaultValue={initial.invoice_prefix} error={err.invoice_prefix} />
        </Field>
        <Field label="Monthly target (MT)" error={err.monthly_target_qty}>
          <Input
            name="monthly_target_qty"
            type="number"
            min="1"
            step="1"
            defaultValue={initial.monthly_target_qty}
            error={err.monthly_target_qty}
          />
        </Field>
      </div>

      {state?.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="green" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}
