export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-indigo font-display text-display-md font-extrabold text-primary">
        00
      </div>
      <h3 className="mb-2 text-heading-sm uppercase">{title}</h3>
      {hint ? <p className="mx-auto mb-6 max-w-md text-ink/70">{hint}</p> : null}
      {action}
    </div>
  );
}
