<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InsufficientStockException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSaleRequest;
use App\Models\CustomerTransaction;
use App\Models\Sale;
use App\Services\AuditLogger;
use App\Services\SalesService;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use App\Support\Permissions;
use Illuminate\Http\Request;

class SaleController extends Controller
{
    public function __construct(
        private SalesService $sales,
        private AuditLogger $audit,
    ) {}

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

        // Audited with rates included regardless of the caller's own
        // SALES_RATE_VIEW: the audit trail is Admin-only anyway, and an
        // invoice's before/after is meaningless without the rate that drove
        // the total (§20).
        $this->audit->record(AuditEntity::SALE, $sale->id, AuditAction::CREATE, [
            'record' => $sale->invoice_no,
            'after' => $this->auditSnapshot($sale),
            'reason' => $request->input('reason'),
            'summary' => sprintf(
                'Created sale %s for %s · %s',
                $sale->invoice_no,
                $sale->customer?->name ?? 'customer',
                $this->money((float) $this->present($sale, true)['total_amount']),
            ),
        ]);

        return response()->json(
            $this->present($sale, (bool) $request->user()?->can(Permissions::SALES_RATE_VIEW)),
            201,
        );
    }

    public function destroy(Request $request, Sale $sale)
    {
        $sale->load(['customer', 'items.product', 'items.meshSize']);
        $before = $this->auditSnapshot($sale);
        $invoiceNo = $sale->invoice_no;
        $customerName = $sale->customer?->name;

        $this->sales->deleteSale($sale->id);

        $this->audit->record(AuditEntity::SALE, $sale->id, AuditAction::DELETE, [
            'record' => $invoiceNo,
            'before' => $before,
            'reason' => $request->input('reason'),
            'summary' => sprintf(
                'Deleted sale %s for %s · %s',
                $invoiceNo,
                $customerName ?? 'customer',
                $this->money((float) ($before['total_amount'] ?? 0)),
            ),
        ]);

        return response()->json(null, 204);
    }

    /**
     * The full invoice — header, every line with its rate and weight, and the
     * computed totals — flattened so the Audit History's before/after can show
     * "Billable TON 20.18 → 20.43" rather than an opaque nested blob (§20).
     */
    private function auditSnapshot(Sale $sale): array
    {
        $presented = $this->present($sale, true);

        return [
            'invoice_no' => $sale->invoice_no,
            'date' => $sale->date?->toDateString(),
            'customer' => $sale->customer?->name,
            'truck_no' => $sale->truck_no,
            'notes' => $sale->notes,
            'paid_at_sale' => (float) $sale->paid_at_sale,
            'total_weight_ton' => $presented['total_weight_ton'],
            'total_amount' => $presented['total_amount'],
            'items' => collect($presented['items'])->map(fn (array $item) => [
                'product' => $item['product_name'],
                'mesh_size' => $item['mesh_size_name'],
                'bags' => $item['bags'],
                'weight_ton' => $item['weight_ton'],
                'rate_per_ton' => $item['rate_per_ton'] ?? null,
                'amount' => $item['amount'],
            ])->all(),
        ];
    }

    private function money(float $amount): string
    {
        return '৳'.number_format($amount, 2);
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
