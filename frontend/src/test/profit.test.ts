import { describe, expect, it } from 'vitest'
import type { Category, CompanyCostSelection, MeshSize, Product, RawMaterialImport, Sale, SaleItem, Transaction } from '@/types'
import { monthlyProfit, yearlyProfit, yearlyProfitTotals } from '@/utils/profit'

const products: Product[] = [{ id: 'p1', name: 'White Limestone', code: 'WL', unit: 'Ton', active: true, createdAt: '' }]
const meshSizes: MeshSize[] = [{ id: 'mesh-1', name: '250', bagKg: 50, active: true, createdAt: '' }]

const categories: Category[] = [
  { id: 'cat-1', name: 'Others', direction: 'out', expenseType: 'company_expense', createdAt: '' },
]

describe('monthlyProfit — §6 worked example', () => {
  // Raw material available: 10,000 kg (10 ton) at an average cost of ৳10/kg
  // (৳10,000/ton). 3,000 kg (3 ton) of it is actually sold this month.
  //
  //     COGS          = 3 ton × ৳10,000/ton      = ৳30,000
  //     Sales          =                            ৳50,000
  //     Gross profit   = 50,000 − 30,000          = ৳20,000
  //     Company costs  =                            ৳8,000
  //     Net profit     = 20,000 − 8,000           = ৳12,000
  const rawMaterialImports: RawMaterialImport[] = [
    { id: 'i1', shipmentId: 's1', date: '2026-09-01', productId: 'p1', grossWeightKg: 10_000, tareWeightKg: 0, pricePerTon: 10_000, createdAt: '' },
  ]

  // 60 bags × 50kg = 3,000 kg = 3 ton, sold for exactly ৳50,000.
  const sales: Sale[] = [
    { id: 's1', invoiceNo: 'INV-2026-001', date: '2026-09-10', customerId: 'c1', paidAtSale: 0, createdAt: '' },
  ]
  const saleItems: SaleItem[] = [
    { id: 'si1', saleId: 's1', productId: 'p1', meshSizeId: 'mesh-1', bags: 60, ratePerTon: 50_000 / 3 },
  ]

  const transactions: Transaction[] = [
    { id: 't1', date: '2026-09-15', details: 'Company costs', accountId: 'acc-1', direction: 'out', category: 'Others', amount: 8_000, createdAt: '' },
  ]
  const companyCostSelections: CompanyCostSelection[] = [{ id: 'sel-1', monthKey: '2026-09', categoryId: 'cat-1' }]

  it('matches the spec exactly, month by month', () => {
    const result = monthlyProfit(2026, 8, { sales, saleItems, products, meshSizes, rawMaterialImports, transactions, categories, companyCostSelections })

    expect(result.totalSales).toBeCloseTo(50_000, 2)
    expect(result.costOfGoodsSold).toBeCloseTo(30_000, 2)
    expect(result.grossProfit).toBeCloseTo(20_000, 2)
    expect(result.totalExpenses).toBe(8_000)
    expect(result.netProfit).toBeCloseTo(12_000, 2)
  })

  it('a month with no sales or costs is all zeros, not undefined', () => {
    const result = monthlyProfit(2026, 0, { sales, saleItems, products, meshSizes, rawMaterialImports, transactions, categories, companyCostSelections })
    expect(result.totalSales).toBe(0)
    expect(result.costOfGoodsSold).toBe(0)
    expect(result.grossProfit).toBe(0)
    expect(result.totalExpenses).toBe(0)
    expect(result.netProfit).toBe(0)
  })

  it('yearlyProfit returns twelve months, and yearlyProfitTotals sums them', () => {
    const months = yearlyProfit(2026, { sales, saleItems, products, meshSizes, rawMaterialImports, transactions, categories, companyCostSelections })
    expect(months).toHaveLength(12)

    const totals = yearlyProfitTotals(months)
    expect(totals.totalSales).toBeCloseTo(50_000, 2)
    expect(totals.netProfit).toBeCloseTo(12_000, 2)
  })
})

describe('monthlyProfit — Company Costs only counts categories explicitly selected for the month', () => {
  it('a Cash Out category that is not selected contributes nothing to Company Costs', () => {
    const transactions: Transaction[] = [
      { id: 't1', date: '2026-09-15', details: 'Unselected expense', accountId: 'acc-1', direction: 'out', category: 'Others', amount: 5_000, createdAt: '' },
    ]

    const result = monthlyProfit(2026, 8, { sales: [], saleItems: [], products, meshSizes, rawMaterialImports: [], transactions, categories, companyCostSelections: [] })

    expect(result.totalExpenses).toBe(0)
    expect(result.netProfit).toBe(0)
  })

  it('only the selected category is summed, never an excluded category or a money-in row', () => {
    const withCategories: Category[] = [
      ...categories,
      { id: 'cat-2', name: 'Unselected Cost', direction: 'out', expenseType: 'company_expense', createdAt: '' },
      { id: 'cat-3', name: 'Cash to Bank', direction: 'out', expenseType: 'excluded', createdAt: '' },
    ]

    const transactions: Transaction[] = [
      { id: 't1', date: '2026-09-05', details: 'Selected', accountId: 'acc-1', direction: 'out', category: 'Others', amount: 3_000, createdAt: '' },
      { id: 't2', date: '2026-09-06', details: 'Unselected', accountId: 'acc-1', direction: 'out', category: 'Unselected Cost', amount: 9_000, createdAt: '' },
      { id: 't3', date: '2026-09-07', details: 'Customer payment', accountId: 'acc-1', direction: 'in', category: 'Customer Payment', amount: 50_000, createdAt: '' },
      { id: 't4', date: '2026-09-08', details: 'Transfer', accountId: 'acc-1', direction: 'out', category: 'Cash to Bank', amount: 20_000, createdAt: '' },
    ]
    const selections: CompanyCostSelection[] = [{ id: 'sel-1', monthKey: '2026-09', categoryId: 'cat-1' }]

    const result = monthlyProfit(2026, 8, {
      sales: [],
      saleItems: [],
      products,
      meshSizes,
      rawMaterialImports: [],
      transactions,
      categories: withCategories,
      companyCostSelections: selections,
    })

    expect(result.totalExpenses).toBe(3_000)
  })
})

describe('monthlyProfit — cost of goods sold reflects only what was sold, not what was imported', () => {
  it('a business that imports 10,000kg but sells nothing has zero COGS', () => {
    const rawMaterialImports: RawMaterialImport[] = [
      { id: 'i1', shipmentId: 's1', date: '2026-09-01', productId: 'p1', grossWeightKg: 10_000, tareWeightKg: 0, pricePerTon: 10_000, createdAt: '' },
    ]

    const result = monthlyProfit(2026, 8, {
      sales: [],
      saleItems: [],
      products,
      meshSizes,
      rawMaterialImports,
      transactions: [],
      categories,
      companyCostSelections: [],
    })

    expect(result.totalSales).toBe(0)
    expect(result.costOfGoodsSold).toBe(0)
  })
})
