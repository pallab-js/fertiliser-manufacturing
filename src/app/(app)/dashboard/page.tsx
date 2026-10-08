import Link from "next/link";
import { connection } from "next/server";
import { getDashboardData } from "@/db/queries/dashboard";
import { formatRupees } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { PeriodLinks } from "@/components/ui/page-parts";
import {
  ProductionBar,
  PurchaseBar,
  QCPassPie,
  SalesLine,
} from "@/components/charts/charts";

const PERIODS = [3, 6, 12];

function ChartCard({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-flat bg-surface-indigo p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading-sm uppercase">{title}</h2>
        <Link href={href} className="text-link text-sm">
          {linkLabel} →
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months } = await searchParams;
  // Marks the aggregations as request-time (they read Date) so the blocking
  // route render doesn't trip Cache Components' unstable-value check.
  await connection();
  const monthCount = PERIODS.includes(Number(months)) ? Number(months) : 6;
  const d = getDashboardData(monthCount);

  const periodLabel = `last ${monthCount} months`;
  const salesTotal = d.salesTrend.reduce((s, r) => s + r.value, 0);
  const prodPct = d.production.target > 0
    ? Math.round((d.production.actual / d.production.target) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Gradient-mesh header band (T025, login pattern reuse) */}
      <div className="mesh-gradient flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div>
          <h1 className="text-display-sm font-extrabold uppercase">Dashboard</h1>
          <p className="mt-1 text-sm text-white/80">
            Factory health at a glance · {periodLabel}
          </p>
        </div>
        <PeriodLinks current={monthCount} basePath="/dashboard" />
      </div>

      {/* KPI row — FR-006, every card links (FR-008) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/sales" className="stat-card stat-card--hero block">
          <p className="text-sm text-white/80">Sales · {periodLabel}</p>
          <p className="mt-2 font-display text-display-sm font-extrabold">
            {formatRupees(salesTotal)}
          </p>
          <p className="mt-1 text-sm text-white/80">{d.salesTrend.filter((r) => r.value > 0).length} months invoiced</p>
        </Link>

        <Link href="/production" className="stat-card block">
          <p className="text-sm text-white/80">Production · this month</p>
          <p className="mt-2 font-display text-display-sm font-extrabold">
            {d.production.actual} <span className="text-xl text-white/70">/ {d.production.target} MT</span>
          </p>
          <p className="mt-1 text-sm text-white/80">{prodPct}% of target</p>
        </Link>

        <Link href="/sales/receivables" className="stat-card block">
          <p className="text-sm text-white/80">Receivables</p>
          <p className="mt-2 font-display text-display-sm font-extrabold">
            {formatRupees(d.receivables)}
          </p>
          <p className="mt-1 text-sm text-white/80">unpaid + partial invoices</p>
        </Link>

        <Link href="/production" className="stat-card block">
          <p className="text-sm text-white/80">QC pass rate · {periodLabel}</p>
          <p className="mt-2 font-display text-display-sm font-extrabold">
            {Math.round(d.qc.rate * 100)}%
          </p>
          <p className="mt-1 text-sm text-white/80">
            {d.qc.pass} pass · {d.qc.fail} fail
          </p>
        </Link>
      </div>

      {/* Charts — 2-col */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Sales trend" href="/sales" linkLabel="Invoices">
          <SalesLine data={d.salesTrend} />
        </ChartCard>
        <ChartCard title="Production vs target" href="/production" linkLabel="Batches">
          <ProductionBar data={d.productionTrend} target={d.production.target} />
        </ChartCard>
        <ChartCard title="Purchase spend" href="/purchases" linkLabel="POs">
          <PurchaseBar data={d.purchaseSpend} />
        </ChartCard>
        <ChartCard title="QC pass rate" href="/production" linkLabel="QC records">
          <QCPassPie pass={d.qc.pass} fail={d.qc.fail} />
        </ChartCard>
      </div>

      {/* Low stock — SC-007 */}
      <section className="panel-flat bg-surface-indigo p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-sm uppercase">Low stock</h2>
          <Link href="/inventory" className="text-link text-sm">
            Inventory →
          </Link>
        </div>
        {d.lowStock.length === 0 ? (
          <p className="text-ink/70">All items above reorder level.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {d.lowStock.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <span className="font-medium">{s.name}</span>
                <span className="flex items-center gap-3 text-ink/70">
                  <Badge neutral>LOW</Badge>
                  {s.balance.toFixed(2)} / {s.reorderLevel.toFixed(2)} {s.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
