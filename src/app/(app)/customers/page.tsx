import { PartyList } from "@/components/parties/server";

export default function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return <PartyList party="customer" title="Customers" label="Customer" searchParams={searchParams} />;
}
