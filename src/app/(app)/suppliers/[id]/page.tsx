import { PartyDetail } from "@/components/parties/server";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartyDetail party="supplier" id={id} />;
}
