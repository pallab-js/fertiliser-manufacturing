import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-parts";
import { ArchiveItemButton, EditItemForm, type ItemValues } from "../items-client";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const { id } = await params;
  const item = db
    .prepare(
      `SELECT id, name, kind, unit, hsn_code, gst_rate, purchase_price_paise,
              reorder_level, archived
         FROM item WHERE id = ?`,
    )
    .get(Number(id)) as
    | (ItemValues & { id: number; archived: number; purchase_price_paise: number })
    | undefined;
  if (!item) notFound();

  const values: ItemValues = {
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    hsn_code: item.hsn_code,
    gst_rate: item.gst_rate,
    purchase_price: item.purchase_price_paise / 100,
    reorder_level: item.reorder_level,
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={item.name}
        action={
          session.role === "admin" ? (
            <ArchiveItemButton id={item.id} archived={item.archived === 1} />
          ) : null
        }
      />

      {item.archived ? (
        <p className="mb-4">
          <Badge>archived</Badge>
        </p>
      ) : null}

      {session.role === "admin" ? (
        <EditItemForm id={item.id} initial={values} />
      ) : (
        <dl className="panel-flat grid grid-cols-2 gap-4 bg-surface-indigo p-6 text-sm">
          {[
            ["Kind", item.kind],
            ["Unit", item.unit],
            ["HSN code", item.hsn_code || "—"],
            ["GST rate", `${item.gst_rate}%`],
            ["Price", `₹${values.purchase_price.toFixed(2)} / ${item.unit}`],
            ["Reorder level", `${item.reorder_level} ${item.unit}`],
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
