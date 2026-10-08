import { db } from "@/db";
import { requireUser } from "@/lib/guard";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-parts";
import { SettingsForm } from "./settings-client";

export default async function SettingsPage() {
  const session = await requireUser();
  if (session.role !== "admin") {
    return (
      <EmptyState title="403 — Admins only" hint="Ask an administrator to change settings." />
    );
  }

  const s = db
    .prepare(
      `SELECT name, address, gstin, state_code, state_name, invoice_prefix,
              monthly_target_qty
         FROM company_settings WHERE id = 1`,
    )
    .get() as {
    name: string;
    address: string;
    gstin: string;
    state_code: string;
    state_name: string;
    invoice_prefix: string;
    monthly_target_qty: number;
  };

  return (
    <div>
      <PageHeader title="Settings" />
      <SettingsForm initial={s} />
    </div>
  );
}
