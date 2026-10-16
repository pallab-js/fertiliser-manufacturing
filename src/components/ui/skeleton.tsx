export function Skeleton({
  className = "",
  height = "16px",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
