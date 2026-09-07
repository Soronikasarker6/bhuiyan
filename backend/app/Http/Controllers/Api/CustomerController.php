<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Services\CustomerLedgerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function __construct(private CustomerLedgerService $ledger) {}

    public function index()
    {
        return Customer::orderBy('name')->get()->map(fn (Customer $c) => array_merge(
            $c->toArray(),
            $this->ledger->totals($c->id)
        ));
    }

    public function show(Customer $customer)
    {
        return array_merge($customer->toArray(), $this->ledger->totals($customer->id));
    }

    /** opening_balance is written once here, mirrored into one ledger row. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:120'],
            'opening_balance' => ['numeric'],
            'notes' => ['nullable', 'string', 'max:500'],
            'active' => ['boolean'],
        ]);

        $customer = DB::transaction(function () use ($data) {
            $customer = Customer::create($data);

            $opening = (float) ($data['opening_balance'] ?? 0);
            if ($opening !== 0.0) {
                CustomerTransaction::create([
                    'customer_id' => $customer->id,
                    'date' => now()->toDateString(),
                    'type' => 'opening_balance',
                    'reference' => $this->ledger->nextReference('opening_balance'),
                    'description' => 'Opening balance',
                    'debit' => max(0, $opening),
                    'credit' => $opening < 0 ? -$opening : 0,
                ]);
            }

            return $customer;
        });

        return response()->json($customer, 201);
    }

    /** opening_balance is immutable after creation — record changes as a payment/advance/adjustment instead. */
    public function update(Request $request, Customer $customer)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
            'active' => ['boolean'],
        ]);

        $customer->update($data);

        return $customer;
    }

    /** Ledger rows referencing this customer are kept, not cascaded, matching the frontend. */
    public function destroy(Customer $customer)
    {
        return $this->guardedDelete(
            fn () => $customer->delete(),
            'This customer has sales recorded against them — their ledger history is kept, but the customer row itself cannot be removed.'
        );
    }

    public function ledger(Customer $customer)
    {
        return response()->json([
            'rows' => $this->ledger->ledgerRows($customer->id),
            'totals' => $this->ledger->totals($customer->id),
        ]);
    }

    public function payments(Request $request, Customer $customer)
    {
        $data = $request->validate([
            'date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'string', 'max:40'],
            'account_id' => ['nullable', 'exists:accounts,id'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $transaction = $this->ledger->recordPayment($data + ['customer_id' => $customer->id]);

        return response()->json($transaction, 201);
    }
}
