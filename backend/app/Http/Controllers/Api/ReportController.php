<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\ProductionEntry;
use App\Models\Sale;
use App\Models\WastageEntry;
use App\Services\CustomerLedgerService;
use App\Services\InventoryService;
use App\Services\LedgerService;
use App\Services\ProfitService;
use App\Services\SalesService;
use Illuminate\Http\Request;

/**
 * One method per report. Every report accepts the shared filter set
 * (from, to, product_id, customer_id, mesh_id, status) where relevant and
 * returns {columns, rows, totals} — the same shape the frontend's PrintPayload
 * already uses for CSV/PDF export.
 */
class ReportController extends Controller
{
    public function __construct(
        private InventoryService $inventory,
        private CustomerLedgerService $customerLedger,
        private LedgerService $ledger,
        private ProfitService $profit,
        private SalesService $sales,
    ) {}

    public function production(Request $request)
    {
        $query = ProductionEntry::with(['product', 'mesh'])->orderByDesc('date');
        $this->applyDateRange($request, $query);
        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }
        if ($request->filled('mesh_id')) {
            $query->where('mesh_id', $request->integer('mesh_id'));
        }

        $rows = $query->get()->map(fn (ProductionEntry $p) => [
            'date' => $p->date->toDateString(),
            'product' => $p->product?->name,
            'mesh' => $p->mesh?->name,
            'bags' => $p->bags,
            'notes' => $p->notes,
        ]);

        return $this->payload('Production Report', $rows, ['bags' => $rows->sum('bags')]);
    }

    public function sales(Request $request)
    {
        $sales = Sale::with(['customer', 'items'])->orderByDesc('date');
        $this->applyDateRange($request, $sales);
        if ($request->filled('customer_id')) {
            $sales->where('customer_id', $request->integer('customer_id'));
        }

        $rows = $sales->get()->map(function (Sale $sale) {
            $total = $sale->items->sum(fn ($i) => $i->amount());
            $paid = (float) CustomerTransaction::where('reference_sale_id', $sale->id)
                ->whereIn('type', ['payment', 'advance_adjustment'])->sum('credit');

            return [
                'invoice_no' => $sale->invoice_no,
                'date' => $sale->date->toDateString(),
                'customer' => $sale->customer?->name,
                'truck_no' => $sale->truck_no,
                'total' => $total,
                'paid' => $paid,
                'due' => max(0, $total - $paid),
                'status' => $total > 0 && $paid >= $total ? 'paid' : ($paid > 0 ? 'partial' : 'due'),
            ];
        });

        if ($request->filled('status')) {
            $rows = $rows->where('status', $request->string('status'))->values();
        }

        return $this->payload('Sales Report', $rows, [
            'total' => $rows->sum('total'), 'paid' => $rows->sum('paid'), 'due' => $rows->sum('due'),
        ]);
    }

    public function inventory()
    {
        $rows = $this->inventory->allRawMaterialStock();

        return $this->payload('Raw Material Inventory', $rows, ['available_ton' => $rows->sum('available_ton')]);
    }

    public function shipments(Request $request)
    {
        $productId = $request->integer('product_id') ?: null;
        $rows = $this->inventory->allShipmentCycles($productId);

        return $this->payload('Shipment Report', $rows->map(fn ($c) => [
            'shipment_id' => $c['shipment']->id,
            'product' => $c['shipment']->product?->name,
            'date' => $c['shipment']->date->toDateString(),
            'received_ton' => $c['received_ton'],
            'opening_ton' => $c['opening_ton'],
            'consumed_ton' => $c['consumed_ton'],
            'closing_ton' => $c['closing_ton'],
            'status' => $c['shipment']->status ?? 'open',
        ]), []);
    }

    public function wastage(Request $request)
    {
        $query = WastageEntry::with('product')->orderByDesc('date');
        $this->applyDateRange($request, $query);
        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }

        $rows = $query->get()->map(fn (WastageEntry $w) => [
            'date' => $w->date->toDateString(),
            'product' => $w->product?->name,
            'quantity_ton' => $w->quantityTon(),
            'reason' => $w->reason,
        ]);

        return $this->payload('Wastage Report', $rows, ['quantity_ton' => $rows->sum('quantity_ton')]);
    }

    public function customerDue()
    {
        $rows = Customer::orderBy('name')->get()
            ->map(fn (Customer $c) => array_merge(['customer' => $c->name], $this->customerLedger->totals($c->id)))
            ->filter(fn ($r) => $r['total_due'] > 0)
            ->sortByDesc('total_due')->values();

        return $this->payload('Customer Outstanding', $rows, ['total_due' => $rows->sum('total_due')]);
    }

    public function customerLedger(Request $request)
    {
        $customerId = $request->integer('customer_id');
        abort_if(! $customerId, 422, 'customer_id is required.');

        $rows = $this->customerLedger->ledgerRows($customerId);
        if ($request->filled('from')) {
            $rows = $rows->filter(fn ($r) => $r['date'] >= $request->string('from'))->values();
        }
        if ($request->filled('to')) {
            $rows = $rows->filter(fn ($r) => $r['date'] <= $request->string('to'))->values();
        }

        return $this->payload('Customer Ledger', $rows, $this->customerLedger->totals($customerId));
    }

    public function payments(Request $request)
    {
        $query = CustomerTransaction::with('customer')->where('type', 'payment')->orderByDesc('date');
        $this->applyDateRange($request, $query);
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->integer('customer_id'));
        }

        $rows = $query->get()->map(fn ($t) => [
            'date' => $t->date->toDateString(),
            'customer' => $t->customer?->name,
            'reference' => $t->reference,
            'method' => $t->method,
            'amount' => (float) $t->credit,
        ]);

        return $this->payload('Payment Report', $rows, ['amount' => $rows->sum('amount')]);
    }

    public function productWise(Request $request)
    {
        $sales = $this->applyDateRangeCollection($request, Sale::with('items.product')->get());

        $rows = $sales->flatMap(fn (Sale $s) => $s->items)
            ->groupBy(fn ($i) => $i->product?->name ?? 'Unknown')
            ->map(fn ($items, $name) => [
                'product' => $name,
                'bags' => $items->sum('bags'),
                'weight_ton' => $items->sum(fn ($i) => $i->billableWeightTon()),
                'amount' => $items->sum(fn ($i) => $i->amount()),
            ])->values();

        return $this->payload('Product-wise Sales', $rows, ['amount' => $rows->sum('amount')]);
    }

    public function meshWise(Request $request)
    {
        $sales = $this->applyDateRangeCollection($request, Sale::with('items.meshSize')->get());

        $rows = $sales->flatMap(fn (Sale $s) => $s->items)
            ->groupBy(fn ($i) => $i->meshSize?->name ?? 'Unknown')
            ->map(fn ($items, $name) => [
                'mesh' => $name,
                'bags' => $items->sum('bags'),
                'weight_ton' => $items->sum(fn ($i) => $i->billableWeightTon()),
                'amount' => $items->sum(fn ($i) => $i->amount()),
            ])->values();

        return $this->payload('Mesh-wise Sales', $rows, ['amount' => $rows->sum('amount')]);
    }

    public function pnl(Request $request)
    {
        $year = $request->integer('year') ?: (int) date('Y');
        $rows = $this->profit->yearlyProfit($year);

        return $this->payload("Profit & Loss {$year}", $rows, $this->profit->yearlyProfitTotals($year));
    }

    public function cashLedger(Request $request)
    {
        return $this->accountKindLedger($request, 'cash');
    }

    public function bankLedger(Request $request)
    {
        return $this->accountKindLedger($request, 'bank');
    }

    private function accountKindLedger(Request $request, string $kind)
    {
        $accountIds = \App\Models\Account::where('kind', $kind)->pluck('id');
        $rows = $this->ledger->ledgerRows()->whereIn('account_id', $accountIds)->values();

        if ($request->filled('from')) {
            $rows = $rows->filter(fn ($r) => $r['date'] >= $request->string('from'))->values();
        }
        if ($request->filled('to')) {
            $rows = $rows->filter(fn ($r) => $r['date'] <= $request->string('to'))->values();
        }

        return $this->payload(ucfirst($kind).' Ledger', $rows, $this->ledger->totalBalances());
    }

    private function applyDateRange(Request $request, $query): void
    {
        if ($request->filled('from')) {
            $query->where('date', '>=', $request->string('from'));
        }
        if ($request->filled('to')) {
            $query->where('date', '<=', $request->string('to'));
        }
    }

    private function applyDateRangeCollection(Request $request, $sales)
    {
        if ($request->filled('from')) {
            $from = $request->string('from');
            $sales = $sales->filter(fn (Sale $s) => $s->date->toDateString() >= $from)->values();
        }
        if ($request->filled('to')) {
            $to = $request->string('to');
            $sales = $sales->filter(fn (Sale $s) => $s->date->toDateString() <= $to)->values();
        }

        return $sales;
    }

    private function payload(string $title, $rows, array $totals)
    {
        return response()->json(['title' => $title, 'rows' => $rows->values(), 'totals' => $totals]);
    }
}
