import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/utils/format'

const AXIS_TICK = { fontSize: 11, fill: 'hsl(32 12% 42%)' }

const REVENUE = 'hsl(146 42% 38%)'
const PROFIT = 'hsl(205 72% 52%)'

export interface SalesTrendPoint {
  month: string
  Sales: number
  Profit: number
}

/**
 * Monthly revenue and net profit.
 *
 * Revenue is the filled line because it is the figure being tracked; profit
 * rides on the same axis as a thin second line, so the gap between them —
 * what the month actually cost to earn — is the thing you read off the chart.
 * Both come from the same records every other page reads; neither is stored.
 */
export function SalesTrendChart({ data, height = 260 }: { data: SalesTrendPoint[]; height?: number }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={REVENUE} stopOpacity={0.26} />
              <stop offset="100%" stopColor={REVENUE} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="hsl(40 22% 87%)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'hsl(40 22% 87%)' }} dy={4} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => compactAxis(value)}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(40 22% 80%)', strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid hsl(40 22% 87%)',
              fontSize: 12,
              boxShadow: '0 12px 32px -8px rgb(46 32 19 / 0.22)',
            }}
            formatter={(value: number) => formatCurrency(value)}
          />
          <Area
            type="monotone"
            dataKey="Sales"
            name="Revenue"
            stroke={REVENUE}
            strokeWidth={2}
            fill="url(#salesTrendFill)"
            dot={{ r: 2.5, strokeWidth: 0, fill: REVENUE }}
            activeDot={{ r: 4.5 }}
          />
          <Line
            type="monotone"
            dataKey="Profit"
            name="Profit"
            stroke={PROFIT}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: PROFIT }}
            activeDot={{ r: 4.5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** The chart's own legend, rendered beside the card title rather than inside the plot. */
export function SalesTrendLegend() {
  return (
    <div className="flex items-center gap-3.5">
      {[
        { label: 'Revenue', color: REVENUE },
        { label: 'Profit', color: PROFIT },
      ].map((series) => (
        <span key={series.label} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: series.color }}
            aria-hidden
          />
          {series.label}
        </span>
      ))}
    </div>
  )
}

function compactAxis(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''

  if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(1)}Cr`
  // Below ten lakh, whole-lakh rounding puts two different ticks on the same
  // label — 1,00,000 and 1,27,200 both read "1L" — so keep a decimal there.
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(abs < 10_00_000 ? 1 : 0)}L`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`

  return `${sign}${abs}`
}
