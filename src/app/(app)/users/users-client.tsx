"use client";

import { useActionState, useState } from "react";
import { createUser, resetPassword, setUserActive } from "@/app/actions/users";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/guard";

export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(createUser, null);
  const [handled, setHandled] = useState<ActionState>(null);

  // React only to a fresh action result (documented "adjust state during
  // render" pattern): close on success, no effect needed.
  if (state && state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + New user
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create user">
        <form action={dispatch} className="space-y-4">
          <Field label="Username" error={state?.fieldErrors?.username}>
            <Input name="username" autoFocus error={state?.fieldErrors?.username} placeholder="store.keeper" />
          </Field>
          <Field label="Password" error={state?.fieldErrors?.password}>
            <Input name="password" type="password" error={state?.fieldErrors?.password} placeholder="min 8 characters" />
          </Field>
          <Field label="Role" error={state?.fieldErrors?.role}>
            <Select name="role" defaultValue="operator">
              <option value="operator">Operator — data entry</option>
              <option value="admin">Admin — full access</option>
            </Select>
          </Field>
          {state?.error ? <p className="field-error">{state.error}</p> : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="green" disabled={pending}>
              {pending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </Modal>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </>
  );
}

export function RowActions({ id, active }: { id: number; active: boolean }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(setUserActive, null);
  const [pwState, pwDispatch, pwPending] = useActionState<ActionState, FormData>(resetPassword, null);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <form
        action={dispatch}
        onSubmit={(e) => {
          if (!window.confirm(active ? "Deactivate this user?" : "Reactivate this user?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={active ? 0 : 1} />
        <Button type="submit" variant="ghost-sm" disabled={pending}>
          {active ? "Deactivate" : "Reactivate"}
        </Button>
      </form>
      <Button type="button" variant="ghost-sm" onClick={() => setResetOpen(true)}>
        Reset password
      </Button>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset password">
        <form
          action={(fd) => {
            fd.append("id", String(id));
            pwDispatch(fd);
          }}
          className="space-y-4"
        >
          <Field label="New password" error={pwState?.fieldErrors?.password}>
            <Input name="password" type="password" autoFocus error={pwState?.fieldErrors?.password} />
          </Field>
          {pwState?.error ? <p className="field-error">{pwState.error}</p> : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="white" disabled={pwPending}>
              {pwPending ? "Saving…" : "Reset"}
            </Button>
          </div>
        </form>
      </Modal>

      <Toast
        message={state?.toast ?? state?.error ?? pwState?.toast ?? pwState?.error}
        error={!state?.ok && !pwState?.ok}
      />
    </div>
  );
}
