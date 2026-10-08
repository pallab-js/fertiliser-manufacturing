import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && !error ? (
        <p className="mt-1 text-sm text-ink/50">{hint}</p>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
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
