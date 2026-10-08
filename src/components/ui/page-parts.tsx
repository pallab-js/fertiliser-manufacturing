import Link from "next/link";

/** GET form — works without JS; ?q= picked up by the page's searchParams. */
export function SearchBar({
  action,
  placeholder,
  q,
  children,
}: {
  action: string;
  placeholder: string;
  q?: string;
  children?: React.ReactNode; /* extra filters (selects) */
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-center gap-3">
      <input
        className="input max-w-64"
        type="search"
        name="q"
        placeholder={placeholder}
        defaultValue={q ?? ""}
      />
      {children}
      <button type="submit" className="btn-ghost-sm">
        Search
      </button>
    </form>
  );
}

const PERIODS = [3, 6, 12];

export function PeriodLinks({ current, basePath }: { current: number; basePath: string }) {
  return (
    <div className="flex overflow-hidden rounded-full border border-white/30">
      {PERIODS.map((n) => (
        <Link
          key={n}
          href={`${basePath}?months=${n}`}
          className={`px-4 py-1.5 text-sm font-medium ${
            n === current ? "bg-white text-primary" : "text-white/80 hover:bg-white/10"
          }`}
        >
          {n}M
        </Link>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="btn-ghost-sm pointer-events-none opacity-40">{label}</span>
    ) : (
      <Link className="btn-ghost-sm" href={`${basePath}?page=${p}`}>
        {label}
      </Link>
    );
  return (
    <div className="mt-4 flex items-center justify-between">
      <span className="text-sm text-ink/60">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {link(page - 1, "Previous", page <= 1)}
        {link(page + 1, "Next", page >= totalPages)}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-heading-sm uppercase">{title}</h1>
      {action}
    </div>
  );
}
