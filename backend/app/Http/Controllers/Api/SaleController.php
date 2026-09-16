<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InsufficientStockException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSaleRequest;
use App\Models\CustomerTransaction;
use App\Models\Sale;
use App\Services\SalesService;
use App\Support\Permissions;
use Illuminate\Http\Request;

class SaleController extends Controller
{
    public function __construct(private SalesService $sales) {}

    public function index(Request $request)
    {
        $query = Sale::with(['customer', 'items.product', 'items.meshSize'])
            ->orderByDesc('date')->orderByDesc('id');

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->integer('customer_id'));
        }
        if ($request->filled('from')) {
            $query->where('date', '>=', $request->string('from'));
        }
        if ($request->filled('to')) {
            $query->where('date', '<=', $request->string('to'));
        }

        $canViewRate = (bool) $request->user()?->can(Permissions::SALES_RATE_VIEW);

        return $query->get()->map(fn (Sale $sale) => $this->present($sale, $canViewRate));
    }

    public function show(Request $request, Sale $sale)
    {
        $sale->load(['customer', 'items.product', 'items.meshSize']);

        return $this->present($sale, (bool) $request->user()?->can(Permissions::SALES_RATE_VIEW));
    }

    public function store(StoreSaleRequest $request)
    {
        try {
            $sale = $this->sales->createSale($request->validated());
        } catch (InsufficientStockException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $sale->load(['customer', 'items.product', 'items.meshSize']);

        return response()->json(
            $this->present($sale, (bool) $request->user()?->can(Permissions::SALES_RATE_VIEW)),
            201,
        );
    }

    public function destroy(Sale $sale)
    {
        $this->sales->deleteSale($sale->id);

        return response()->json(null, 204);
    }

    public function nextInvoiceNo(Request $request)
    {
        $year = $request->integer('year') ?: (int) date('Y');

        return response()->json(['invoice_no' => $this->sales->nextInvoiceNo($year)]);
    }

    /** Shapes a sale like the frontend's SaleSummary — totals/due/status computed, never stored. */
    private function present(Sale $sale, bool $canViewRate = false): array
    {
        $items = $sale->items->map(function ($item) use ($canViewRate) {
            $data = array_merge($item->toArray(), [
                'product_name' => $item->product?->name,
                'mesh_size_name' => $item->meshSize?->name,
                'bag_kg' => (float) $item->meshSize?->bag_kg,
                'calculated_weight_ton' => $item->calculatedWeightTon(),
                'weight_ton' => $item->billableWeightTon(),
                'amount' => $item->amount(),
            ]);

            if (! $canViewRate) {
                unset($data['rate_per_ton']);
            }

            return $data;
        });

        $totalAmount = $items->sum('amount');
        $totalWeightTon = $items->sum('weight_ton');
        $amountPaid = (float) CustomerTransaction::where('reference_sale_id', $sale->id)
            ->whereIn('type', ['payment', 'advance_adjustment'])
            ->sum('credit');
        $amountDue = max(0.0, $totalAmount - $amountPaid);
        $status = $totalAmount > 0 && $amountPaid >= $totalAmount
            ? 'paid'
            : ($amountPaid > 0 ? 'partial' : 'due');

        return array_merge($sale->toArray(), [
            'customer_name' => $sale->customer?->name,
            'items' => $items,
            'total_amount' => $totalAmount,
            'total_weight_ton' => $totalWeightTon,
            'amount_paid' => $amountPaid,
            'amount_due' => $amountDue,
            'status' => $status,
        ]);
    }
}
