"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatRupees } from "@/lib/money";

/** Charts per docs/ui-ux-guide §4: Blurple owns the main series, magenta is
 *  the comparison/target, green only for "achieved"; hairline grid, ink/60
 *  axis at 14px, surface-indigo tooltip. Recharts consumes the resolved CSS
 *  variables directly. */

export type MonthValue = { month: string; value: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? m;
const fullMonth = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

const axis = { fill: "rgb(255 255 255 / 0.6)", fontSize: 14 } as const;
const tooltipStyle = {
  background: "var(--color-surface-indigo)",
  border: "1px solid var(--color-hairline)",
  borderRadius: 16,
} as const;
const grid = { stroke: "var(--color-hairline)", vertical: false } as const;
// recharts radius in px — radius-sm (12px) reads too heavy on narrow SVG bars,
// radius-xs keeps the soft top DESIGN.md asks for.
const barRadius = [6, 6, 0, 0] as [number, number, number, number];

/** Screen-reader fallback for the visual chart (T024 a11y requirement). */
function A11yTable({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const rupeeTick = (v: number) =>
  v >= 100_000 ? `₹${(v / 100_000).toFixed(v >= 1_000_000 ? 0 : 1)}L` : `₹${(v / 1000).toFixed(0)}k`;

export function SalesLine({ data }: { data: MonthValue[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="month" tickFormatter={shortMonth} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={rupeeTick} tick={axis} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(l) => fullMonth(String(l))}
            formatter={(v) => [formatRupees(Number(v)), "Sales"]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            name="Sales"
          />
        </LineChart>
      </ResponsiveContainer>
      <A11yTable
        caption="Sales value by month"
        rows={data.map((d) => [fullMonth(d.month), formatRupees(d.value)])}
      />
    </>
  );
}

export function ProductionBar({ data, target }: { data: MonthValue[]; target: number }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="month" tickFormatter={shortMonth} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tick={axis} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(l) => fullMonth(String(l))}
            formatter={(v) => [`${v} MT`, "Output"]}
          />
          {target > 0 ? (
            <ReferenceLine
              y={target}
              stroke="var(--color-magenta)"
              strokeDasharray="6 4"
              label={{ value: `Target ${target}`, position: "insideTopRight", fill: "var(--color-magenta)", fontSize: 13 }}
            />
          ) : null}
          <Bar dataKey="value" fill="var(--color-primary)" radius={barRadius} name="Output" />
        </BarChart>
      </ResponsiveContainer>
      <A11yTable
        caption="Production output by month against target"
        rows={data.map((d) => [fullMonth(d.month), `${d.value} MT`])}
      />
    </>
  );
}

export function PurchaseBar({ data }: { data: MonthValue[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="month" tickFormatter={shortMonth} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={rupeeTick} tick={axis} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(l) => fullMonth(String(l))}
            formatter={(v) => [formatRupees(Number(v)), "Spend"]}
          />
          <Bar dataKey="value" fill="var(--color-link)" radius={barRadius} name="Spend" />
        </BarChart>
      </ResponsiveContainer>
      <A11yTable
        caption="Purchase spend by month"
        rows={data.map((d) => [fullMonth(d.month), formatRupees(d.value)])}
      />
    </>
  );
}

export function QCPassPie({ pass, fail }: { pass: number; fail: number }) {
  if (pass + fail === 0) {
    return <div className="flex h-[240px] items-center justify-center text-ink/60">No QC tests in this period</div>;
  }
  const rate = Math.round((pass / (pass + fail)) * 100);
  const slices = [
    { name: "Pass", value: pass },
    { name: "Fail", value: fail },
  ];
  return (
    <>
      <div className="relative">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
            >
              <Cell fill="var(--color-green)" />
              <Cell fill="var(--color-magenta)" />
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} batches`, String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-extrabold">{rate}%</span>
          <span className="text-sm text-ink/60">pass</span>
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-5 text-sm text-ink/70">
        <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full bg-green" />{pass} pass</span>
        <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full bg-magenta" />{fail} fail</span>
      </div>
      <A11yTable caption="QC results" rows={slices.map((s) => [s.name, String(s.value)])} />
    </>
  );
}
