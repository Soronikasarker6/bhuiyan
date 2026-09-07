<?php

namespace App\Services;

use App\Models\Sale;
use Illuminate\Support\Collection;

/**
 * Ported from src/utils/profit.ts. Cost of goods sold is deliberately "weight
 * actually sold this month", not "raw material bought this month" — importing
 * 10,000kg but selling 3,000kg only counts 3,000kg's cost.
 *
 *   grossProfit = totalSales - costOfGoodsSold
 *   netProfit   = grossProfit - totalExpenses (this month's Cash & Bank "out", transfers excluded)
 */
class ProfitService
{
    public function __construct(private InventoryService $inventory, private LedgerService $ledger) {}

    public function monthlyProfit(int $year, int $monthIndex): array
    {
        $monthKey = sprintf('%04d-%02d', $year, $monthIndex + 1);

        $sales = Sale::with('items.meshSize')
            ->whereYear('date', $year)->whereMonth('date', $monthIndex + 1)
            ->get();

        $totalSales = 0.0;
        $tonsSoldByProduct = [];

        foreach ($sales as $sale) {
            foreach ($sale->items as $item) {
                $totalSales += $item->amount();
                $tonsSoldByProduct[$item->product_id] = ($tonsSoldByProduct[$item->product_id] ?? 0)
                    + $item->billableWeightTon();
            }
        }

        $costOfGoodsSold = 0.0;
        foreach ($tonsSoldByProduct as $productId => $tons) {
            $avgCost = $this->inventory->averageCostPerTon((int) $productId);
            if ($avgCost !== null) {
                $costOfGoodsSold += $tons * $avgCost;
            }
        }

        $grossProfit = $totalSales - $costOfGoodsSold;
        $totalExpenses = $this->ledger->monthMovement($monthKey)['month_out'];
        $netProfit = $grossProfit - $totalExpenses;

        return [
            'year' => $year,
            'month_index' => $monthIndex,
            'total_sales' => $totalSales,
            'cost_of_goods_sold' => $costOfGoodsSold,
            'gross_profit' => $grossProfit,
            'total_expenses' => $totalExpenses,
            'net_profit' => $netProfit,
            'gross_margin' => $totalSales == 0 ? 0.0 : ($grossProfit / $totalSales) * 100,
            'net_margin' => $totalSales == 0 ? 0.0 : ($netProfit / $totalSales) * 100,
        ];
    }

    /** @return Collection<int, array> all 12 months of a year */
    public function yearlyProfit(int $year): Collection
    {
        return collect(range(0, 11))->map(fn ($m) => $this->monthlyProfit($year, $m));
    }

    public function yearlyProfitTotals(int $year): array
    {
        $months = $this->yearlyProfit($year);

        return [
            'total_sales' => $months->sum('total_sales'),
            'cost_of_goods_sold' => $months->sum('cost_of_goods_sold'),
            'gross_profit' => $months->sum('gross_profit'),
            'total_expenses' => $months->sum('total_expenses'),
            'net_profit' => $months->sum('net_profit'),
        ];
    }
}
