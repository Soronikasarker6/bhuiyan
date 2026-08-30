import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PnlSeriesPoint } from '@/utils/pnl'
import { formatCompact, formatCurrency } from '@/utils/format'

/**
 * Sales against profit, month by month.
 *
 * A line chart rather than bars because the question is the shape of the year
 * — is the gap between the two lines widening or closing — and that is what a
 * line answers and a bar does not. Sales in maroon, net profit in green, with
 * the zero line drawn so a loss-making month is unmistakable.
 */

const AXIS_TICK = { fontSize: 11, fill: 'hsl(32 12% 42%)' }

export function SalesProfitChart({
  data,
  height = 300,
  showGross = false,
}: {
  data: PnlSeriesPoint[]
  height?: number
  showGross?: boolean
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="hsl(40 22% 87%)" strokeDasharray="3 4" vertical={false} />

          <XAxis
            dataKey="month"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'hsl(40 22% 87%)' }}
            dy={4}
          />

          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => compactAxis(value)}
          />

          <Tooltip
            cursor={{ stroke: 'hsl(40 22% 80%)', strokeWidth: 1 }}
            content={<ChartTooltip />}
          />

          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, paddingBottom: 4 }}
          />

          <Line
            type="monotone"
            dataKey="Sales"
            stroke="hsl(88 16% 30%)"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'hsl(88 16% 30%)' }}
            activeDot={{ r: 4.5 }}
          />

          {showGross && (
            <Line
              type="monotone"
              dataKey="Gross Profit"
              stroke="hsl(38 45% 45%)"
              strokeWidth={1.75}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}

          <Line
            type="monotone"
            dataKey="Net Profit"
            stroke="hsl(132 20% 28%)"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'hsl(132 20% 28%)' }}
            activeDot={{ r: 4.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Axis labels in lakh and crore — the units people here actually think in. */
function compactAxis(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''

  if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(1)}Cr`
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(0)}L`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`

  return `${sign}${abs}`
}

interface TooltipPayload {
  name: string
  value: number
  color: string
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-pop">
      <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.name}
            </span>
            <span
              className="font-mono tabular font-medium"
              style={{ color: entry.value < 0 ? 'hsl(8 55% 42%)' : undefined }}
            >
              {formatCurrency(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Compact export used by the reports page for the same series. */
export { formatCompact }
