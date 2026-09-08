import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '@/utils/format'

const AXIS_TICK = { fontSize: 11, fill: 'hsl(32 12% 42%)' }

export interface SalesTrendPoint {
  month: string
  Sales: number
}

/** Monthly sales revenue, one line — the shape of the year, nothing else on it. */
export function SalesTrendChart({ data, height = 260 }: { data: SalesTrendPoint[]; height?: number }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
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
          <Line
            type="monotone"
            dataKey="Sales"
            stroke="hsl(88 16% 30%)"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'hsl(88 16% 30%)' }}
            activeDot={{ r: 4.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function compactAxis(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''

  if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(1)}Cr`
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(0)}L`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`

  return `${sign}${abs}`
}
