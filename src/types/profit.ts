// There is no manually-entered P&L anymore — every figure below is computed
// from real records elsewhere (Sales, raw material cost, the Cash & Bank
// Ledger's own categorised outgoings) by `utils/profit.ts`. Nothing here is
// ever stored; a typed profit figure is one that stops agreeing with the
// sales and costs behind it the moment either changes.

/** One month's profit, entirely computed. */
export interface MonthlyProfit {
  year: number
  /** 0–11, so it indexes MONTHS directly. */
  monthIndex: number
  totalSales: number
  costOfGoodsSold: number
  grossProfit: number
  totalExpenses: number
  netProfit: number
  grossMargin: number
  netMargin: number
}
