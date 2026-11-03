import type { ID, SaleType } from '@/types'
import { http } from './httpClient'

export interface SaleItemInput {
  productId: ID
  meshSizeId: ID
  bags: number
  ratePerTon: number
  actualWeightTon?: number
}

/**
 * One shape for both kinds of sale. A finished-product sale sends `items`;
 * a raw material sale sends `rawMaterial` instead (its one line is built from
 * it server-side — the net weight entered at billing, billed and deducted
 * from raw stock).
 */
export interface SaleInput {
  saleType?: SaleType
  date: string
  customerId: ID
  truckNo?: string
  notes?: string
  paidAtSale?: number
  /** Which Cash & Bank account a "paid at sale" amount lands in — the backend falls back to the system Cash account when omitted. */
  accountId?: ID
  items: SaleItemInput[]
  /** Raw material sales only: the material, its net weight in kg as entered at billing, and the rate. */
  rawMaterial?: { productId: ID; netWeightKg: number; ratePerTon: number }
}

function toPayload(data: SaleInput) {
  if (data.saleType === 'raw_material' && data.rawMaterial) {
    return {
      sale_type: 'raw_material',
      date: data.date,
      customer_id: data.customerId,
      product_id: data.rawMaterial.productId,
      net_weight_kg: data.rawMaterial.netWeightKg,
      rate_per_ton: data.rawMaterial.ratePerTon,
      truck_no: data.truckNo,
      notes: data.notes,
      paid_at_sale: data.paidAtSale ?? 0,
      account_id: data.accountId,
    }
  }

  return {
    sale_type: 'finished_product',
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
  update(id: ID, data: SaleInput): Promise<{ invoice_no: string }> {
    return http.put(`/sales/${id}`, toPayload(data))
  },
  remove(id: ID): Promise<void> {
    return http.delete(`/sales/${id}`)
  },
  /** Admin-only (SALES_REVERSE): cancel a sale by offsetting entries on `date`; the sale itself is kept. */
  reverse(id: ID, input: { reason: string; date: string }): Promise<unknown> {
    return http.post(`/sales/${id}/reverse`, { reason: input.reason, date: input.date })
  },
  async nextInvoiceNo(year: number): Promise<string> {
    const { invoice_no } = await http.get<{ invoice_no: string }>(`/sales/next-invoice-no?year=${year}`)
    return invoice_no
  },
}
