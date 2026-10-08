import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { lastNMonths } from "@/lib/dates";
import { spendByMonth, spendBySupplier } from "@/db/queries/purchases";
import { zeroFill } from "@/db/queries/dashboard";
import { formatRupees } from "@/lib/money";
import { PeriodLinks } from "@/components/ui/page-parts";
import { EmptyState } from "@/components/ui/empty-state";

const PERIODS = [3, 6, 12];

/** FR-022: spend by period and supplier, from receipts. */
export default async function PurchaseReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  await requireUser();
  const { months } = await searchParams;
  const monthCount = PERIODS.includes(Number(months)) ? Number(months) : 12;

  const period = lastNMonths(monthCount);
  const since = `${period[0]}-01`;
  const byMonth = zeroFill(period, spendByMonth(since));
  const bySupplier = spendBySupplier(since);
  const total = bySupplier.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="space-y-6">
      <div className="mesh-gradient flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div>
          <h1 className="text-display-sm font-extrabold uppercase">Purchase reports</h1>
          <p className="mt-1 text-sm text-white/80">
            Spend from receipts · last {monthCount} months ·{" "}
            <Link href="/purchases" className="text-link">
              ← all purchases
            </Link>
          </p>
        </div>
        <PeriodLinks current={monthCount} basePath="/purchases/reports" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="stat-card">
          <p className="text-sm text-white/80">Total spend · {monthCount}M</p>
          <p className="mt-1 font-display text-display-sm font-extrabold tabular-nums">
            {formatRupees(total)}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-white/80">Suppliers paid</p>
          <p className="mt-1 font-display text-display-sm font-extrabold tabular-nums">
            {bySupplier.length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-heading-sm uppercase">By month</h2>
          <div className="panel-flat bg-surface-indigo p-6 text-sm">
            {total === 0 ? (
              <EmptyState title="No spend in this period" hint="Receipts in the period will total here." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-hairline text-left text-ink/50">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 text-right font-medium">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map((m) => (
                    <tr key={m.month} className="border-b border-hairline last:border-0">
                      <td className="py-2">{m.month}</td>
                      <td className="py-2 text-right tabular-nums">{formatRupees(m.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-heading-sm uppercase">By supplier</h2>
          <div className="panel-flat bg-surface-indigo p-6 text-sm">
            {bySupplier.length === 0 ? (
              <EmptyState title="No receipts in this period" hint="Receive goods against POs to see spend." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-hairline text-left text-ink/50">
                    <th className="pb-2 font-medium">Supplier</th>
                    <th className="pb-2 text-right font-medium">Spend</th>
                    <th className="pb-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {bySupplier.map((s) => (
                    <tr key={s.supplier} className="border-b border-hairline last:border-0">
                      <td className="py-2">{s.supplier}</td>
                      <td className="py-2 text-right tabular-nums">{formatRupees(s.value)}</td>
                      <td className="py-2 text-right tabular-nums text-ink/60">
                        {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
