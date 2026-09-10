import type { ID } from '@/types'
import { http } from './httpClient'

export interface SaleItemInput {
  productId: ID
  meshSizeId: ID
  bags: number
  ratePerTon: number
  actualWeightTon?: number
}

export interface SaleInput {
  date: string
  customerId: ID
  truckNo?: string
  notes?: string
  paidAtSale?: number
  /** Which Cash & Bank account a "paid at sale" amount lands in — the backend falls back to the system Cash account when omitted. */
  accountId?: ID
  items: SaleItemInput[]
}

function toPayload(data: SaleInput) {
  return {
    date: data.date,
    customer_id: data.customerId,
    truck_no: data.truckNo,
    notes: data.notes,
    paid_at_sale: data.paidAtSale ?? 0,
    account_id: data.accountId,
    items: data.items.map((item) => ({
      product_id: item.productId,
      mesh_size_id: item.meshSizeId,
      bags: item.bags,
      rate_per_ton: item.ratePerTon,
      actual_weight_ton: item.actualWeightTon,
    })),
  }
}

/** Returns are intentionally loose — every mutation is followed by re-fetching /app-data. */
export const salesService = {
  create(data: SaleInput): Promise<{ invoice_no: string }> {
    return http.post('/sales', toPayload(data))
  },
  remove(id: ID): Promise<void> {
    return http.delete(`/sales/${id}`)
  },
  async nextInvoiceNo(year: number): Promise<string> {
    const { invoice_no } = await http.get<{ invoice_no: string }>(`/sales/next-invoice-no?year=${year}`)
    return invoice_no
  },
}
