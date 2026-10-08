"use client";

import { useActionState, useState } from "react";
import { createParty, setPartyArchived, updateParty } from "@/app/actions/parties";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

export type Party = "customer" | "supplier";

export type PartyValues = {
  name: string;
  gstin: string;
  state_code: string;
  address: string;
  phone: string;
  email: string;
};

function PartyFields({ state, initial }: { state: ActionState; initial?: PartyValues }) {
  const err = state?.fieldErrors ?? {};
  const v = initial;
  return (
    <>
      <Field label="Name" error={err.name}>
        <Input name="name" defaultValue={v?.name} error={err.name} autoFocus={!v} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="GSTIN" hint="Blank if unregistered" error={err.gstin}>
          <Input name="gstin" defaultValue={v?.gstin} error={err.gstin} placeholder="27AAACS1234A1Z5" />
        </Field>
        <Field label="State code" hint="e.g. 27" error={err.state_code}>
          <Input name="state_code" defaultValue={v?.state_code} error={err.state_code} placeholder="27" />
        </Field>
      </div>
      <Field label="Address" error={err.address}>
        <Input name="address" defaultValue={v?.address} error={err.address} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone" error={err.phone}>
          <Input name="phone" defaultValue={v?.phone} error={err.phone} />
        </Field>
        <Field label="Email" error={err.email}>
          <Input name="email" type="email" defaultValue={v?.email} error={err.email} />
        </Field>
      </div>
      {state?.error ? <p className="field-error">{state.error}</p> : null}
    </>
  );
}

export function NewPartyButton({ party, label }: { party: Party; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(createParty, null);
  const [handled, setHandled] = useState<ActionState>(null);

  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button className="btn-green" onClick={() => setOpen(true)}>+ New {label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`New ${label}`}>
        <form action={dispatch} className="space-y-4">
          <input type="hidden" name="party" value={party} />
          <PartyFields state={state} />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="green" disabled={pending}>
              {pending ? "Saving…" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
      <Toast message={state?.ok ? state.toast : undefined} />
    </>
  );
}

export function EditPartyForm({
  party,
  id,
  initial,
}: {
  party: Party;
  id: number;
  initial: PartyValues;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(updateParty, null);
  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="party" value={party} />
      <input type="hidden" name="id" value={id} />
      <PartyFields state={state} initial={initial} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}

export function ArchivePartyButton({
  party,
  id,
  archived,
}: {
  party: Party;
  id: number;
  archived: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(setPartyArchived, null);
  return (
    <form action={dispatch} className="inline">
      <input type="hidden" name="party" value={party} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <Button type="submit" variant="ghost-sm" disabled={pending}>
        {archived ? "Restore" : "Archive"}
      </Button>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}
