import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-parts";
import { CreateUserButton, RowActions } from "./users-client";

type UserRow = {
  id: number;
  username: string;
  role: "admin" | "operator";
  active: number;
  created_at: string;
};

export default async function UsersPage() {
  const session = await requireUser();
  if (session.role !== "admin") {
    return (
      <EmptyState
        title="403 — Admins only"
        hint="Ask an administrator to manage users."
      />
    );
  }

  const users = db
    .prepare(
      `SELECT id, username, role, active, created_at
         FROM user ORDER BY role, username`,
    )
    .all() as UserRow[];

  const columns: Column<UserRow>[] = [
    { header: "Username", cell: (r) => <span className="font-medium">{r.username}</span> },
    {
      header: "Role",
      cell: (r) => <Badge neutral={r.role !== "admin"}>{r.role}</Badge>,
    },
    {
      header: "Status",
      cell: (r) => <Badge neutral={r.active === 1}>{r.active ? "active" : "disabled"}</Badge>,
    },
    {
      header: "Created",
      cell: (r) => <span className="text-ink/60">{r.created_at.slice(0, 10)}</span>,
    },
    {
      header: "",
      cell: (r) => <RowActions id={r.id} active={r.active === 1} />,
    },
  ];

  return (
    <div>
      <PageHeader title="Users" action={<CreateUserButton />} />
      <DataTable
        columns={columns}
        rows={users}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No users yet" hint="Create the first account." />}
      />
    </div>
  );
}
