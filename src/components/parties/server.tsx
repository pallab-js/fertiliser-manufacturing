import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SearchBar } from "@/components/ui/page-parts";
import {
  ArchivePartyButton,
  EditPartyForm,
  NewPartyButton,
  type Party,
  type PartyValues,
} from "./client";

type PartyRow = PartyValues & { id: number; archived: number };

function base(party: Party): string {
  return party === "customer" ? "/customers" : "/suppliers";
}

export async function PartyList({
  party,
  title,
  label,
  searchParams,
}: {
  party: Party;
  title: string;
  label: string;
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const rows = db
    .prepare(
      `SELECT id, name, gstin, state_code, address, phone, email, archived
         FROM ${party}
        WHERE (? = '' OR name LIKE '%' || ? || '%')
        ORDER BY archived, name`,
    )
    .all(query, query) as PartyRow[];

  const columns: Column<PartyRow>[] = [
    {
      header: "Name",
      cell: (r) => (
        <Link href={`${base(party)}/${r.id}`} className="text-link font-medium">
          {r.name}
        </Link>
      ),
    },
    { header: "GSTIN", cell: (r) => <span className="text-ink/60">{r.gstin || "—"}</span> },
    { header: "State", cell: (r) => r.state_code || "—" },
    { header: "Phone", cell: (r) => <span className="text-ink/60">{r.phone || "—"}</span> },
    {
      header: "",
      cell: (r) =>
        session.role === "admin" ? (
          <ArchivePartyButton party={party} id={r.id} archived={r.archived === 1} />
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        action={session.role === "admin" ? <NewPartyButton party={party} label={label} /> : null}
      />
      <div className="mb-4">
        <SearchBar action={base(party)} placeholder={`Search ${title.toLowerCase()}…`} q={query} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          query ? (
            <EmptyState title="No matches" hint={`Nothing found for “${query}”.`} />
          ) : (
            <EmptyState title={`No ${title.toLowerCase()} yet`} hint={`Add your first ${label.toLowerCase()}.`} />
          )
        }
      />
    </div>
  );
}

export async function PartyDetail({
  party,
  id,
}: {
  party: Party;
  id: string;
}) {
  const session = await requireUser();
  const row = db
    .prepare(
      `SELECT id, name, gstin, state_code, address, phone, email, archived
         FROM ${party} WHERE id = ?`,
    )
    .get(Number(id)) as PartyRow | undefined;
  if (!row) notFound();

  const label = party === "customer" ? "Customer" : "Supplier";
  const values: PartyValues = {
    name: row.name,
    gstin: row.gstin,
    state_code: row.state_code,
    address: row.address,
    phone: row.phone,
    email: row.email,
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={row.name}
        action={
          session.role === "admin" ? (
            <ArchivePartyButton party={party} id={row.id} archived={row.archived === 1} />
          ) : null
        }
      />
      <p className="mb-4 text-sm text-ink/60">{label}</p>
      {row.archived ? (
        <p className="mb-4">
          <Badge>archived</Badge>
        </p>
      ) : null}
      {session.role === "admin" ? (
        <EditPartyForm party={party} id={row.id} initial={values} />
      ) : (
        <dl className="panel-flat grid grid-cols-2 gap-4 bg-surface-indigo p-6 text-sm">
          {[
            ["GSTIN", row.gstin || "—"],
            ["State", row.state_code || "—"],
            ["Phone", row.phone || "—"],
            ["Email", row.email || "—"],
            ["Address", row.address || "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink/50">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
