import { PartyList } from "@/components/parties/server";

export default function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return <PartyList party="supplier" title="Suppliers" label="Supplier" searchParams={searchParams} />;
}
