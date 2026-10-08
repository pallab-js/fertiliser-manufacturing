import { PartyDetail } from "@/components/parties/server";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartyDetail party="customer" id={id} />;
}
