export type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  num?: boolean;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: React.ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label="Table"
      tabIndex={0}
    >
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={`${c.header}-${i}`} scope="col" className={c.num ? "num" : undefined}>
                {c.header || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c, i) => (
                <td key={`${c.header}-${i}`} className={c.num ? "num" : undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
