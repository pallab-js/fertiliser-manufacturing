"use client";

import { cloneElement, isValidElement, useId } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  // Associate the label with a single form control automatically. Multi-control
  // fields pass an explicit htmlFor + id instead.
  const childProps = isValidElement(children)
    ? (children.props as Record<string, unknown>)
    : null;
  const control =
    childProps && (childProps.id || !htmlFor)
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          id: childProps.id ?? id,
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
        })
      : children;

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="mt-1 text-sm text-ink/50">{hint}</p>
      ) : null}
      {error ? <p id={errorId} className="field-error">{error}</p> : null}
    </div>
  );
}

export function Input({
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      {...props}
      aria-invalid={error ? "true" : undefined}
      className={className ? `input ${className}` : "input"}
    />
  );
}

export function Select({
  error,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select
      {...props}
      aria-invalid={error ? "true" : undefined}
      className={className ? `input ${className}` : "input"}
    >
      {children}
    </select>
  );
}
