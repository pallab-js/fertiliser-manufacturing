"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";

export function LoginForm() {
  const [state, dispatch] = useActionState(login, null);

  return (
    <form action={dispatch} className="space-y-5">
      <Field label="Username" error={state?.fieldErrors?.username}>
        <Input
          name="username"
          autoComplete="username"
          autoFocus
          placeholder="admin"
          error={state?.fieldErrors?.username}
        />
      </Field>
      <Field label="Password" error={state?.fieldErrors?.password}>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={state?.fieldErrors?.password}
        />
      </Field>

      {state?.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn-green w-full">
        Sign in
      </button>

      <p className="text-center text-sm text-ink/50">
        Fertilizer factory management ·{" "}
        <Link href="/dashboard" className="text-link">
          dashboard
        </Link>
      </p>
      <Toast message={state?.ok ? state.toast : state?.error} error={!state?.ok} />
    </form>
  );
}
