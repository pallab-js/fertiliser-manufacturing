export function Badge({
  children,
  neutral = false,
}: {
  children: React.ReactNode;
  neutral?: boolean;
}) {
  return <span className={neutral ? "badge badge-neutral" : "badge"}>{children}</span>;
}
