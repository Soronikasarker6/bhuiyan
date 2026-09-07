import { http } from './httpClient'
import { toQuery } from './mappers'

export interface ReportFilters {
  from?: string
  to?: string
  productId?: string
  customerId?: string
  meshId?: string
  status?: string
  year?: number
}

export interface ReportPayload {
  title: string
  rows: unknown[]
  totals: Record<string, unknown>
}

/**
 * Thin wrappers over the backend's `/api/reports/*` endpoints. The Reports
 * page itself still builds its tables from the bootstrapped `data` via the
 * existing `src/utils/*.ts` functions (unchanged); these are here so a
 * report can be moved server-side later without inventing a new call shape.
 */
function report(path: string, filters: ReportFilters = {}): Promise<ReportPayload> {
  const qs = toQuery({
    from: filters.from,
    to: filters.to,
    product_id: filters.productId,
    customer_id: filters.customerId,
    mesh_id: filters.meshId,
    status: filters.status,
    year: filters.year,
  })
  return http.get(`/reports/${path}${qs}`)
}

export const reportService = {
  production: (f?: ReportFilters) => report('production', f),
  sales: (f?: ReportFilters) => report('sales', f),
  inventory: () => report('inventory'),
  shipments: (f?: ReportFilters) => report('shipments', f),
  wastage: (f?: ReportFilters) => report('wastage', f),
  customerDue: () => report('customer-due'),
  customerLedger: (f: ReportFilters) => report('customer-ledger', f),
  payments: (f?: ReportFilters) => report('payments', f),
  productWise: (f?: ReportFilters) => report('product-wise', f),
  meshWise: (f?: ReportFilters) => report('mesh-wise', f),
  pnl: (f?: ReportFilters) => report('pnl', f),
  cashLedger: (f?: ReportFilters) => report('cash-ledger', f),
  bankLedger: (f?: ReportFilters) => report('bank-ledger', f),
}
