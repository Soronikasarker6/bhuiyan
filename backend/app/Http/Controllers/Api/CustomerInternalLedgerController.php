<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerInternalLedgerEntry;
use App\Services\CustomerInternalLedgerService;
use App\Support\StaleWrite;
use Illuminate\Http\Request;

/**
 * Customers → Customer Ledger (Private). Admin only.
 *
 * The owner's own bookkeeping. Every route reaching this controller sits
 * behind `permission:CUSTOMER_INTERNAL_LEDGER_VIEW` in routes/api.php, which
 * only the Admin role holds (see RoleSeeder) — a Manager calling any of these
 * directly, with a valid token and no browser involved, is refused by the
 * middleware before any code here runs.
 *
 * Nothing here touches sales, payments, cash, bank, stock or P&L. This
 * ledger's entries live in their own table and are read by nothing else; see
 * CustomerInternalLedgerService and the migration for why.
 *
 * The listing is not paginated: a private book is read a party at a time, and
 * the running balance on every row has to be derived from the complete series
 * anyway (§12) — paginating the source would be the thing that breaks it.
 */
class CustomerInternalLedgerController extends Controller
{
    public function __construct(private CustomerInternalLedgerService $ledger) {}

    public function index(Request $request)
    {
        $filters = $request->validate([
            'customer_id' => ['nullable', 'exists:customers,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'type' => ['nullable', 'in:debit,credit'],
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        $customerId = $filters['customer_id'] ?? null;
        $result = $this->ledger->ledger([
            'customer_id' => $customerId ? (int) $customerId : null,
            'from' => $filters['from'] ?? null,
            'to' => $filters['to'] ?? null,
            'type' => $filters['type'] ?? null,
            'search' => $filters['search'] ?? null,
        ]);

        return response()->json([
            'rows' => $result['rows'],
            'summary' => $result['summary'],
            'narrowed' => $result['narrowed'],
            // The party's stated opening figure, for the ledger header — only
            // meaningful when one party is selected.
            'opening' => $customerId ? $this->ledger->opening((int) $customerId) : null,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validateEntry($request);

        try {
            return response()->json($this->present($this->ledger->createEntry($data)), 201);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function update(Request $request, CustomerInternalLedgerEntry $internalLedgerEntry)
    {
        $data = $this->validateEntry($request);

        if ($stale = StaleWrite::check($internalLedgerEntry, $request->input('expected_updated_at'))) {
            return $stale;
        }

        try {
            return response()->json($this->present($this->ledger->updateEntry($internalLedgerEntry, $data)));
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function destroy(Request $request, CustomerInternalLedgerEntry $internalLedgerEntry)
    {
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:255']])['reason'] ?? null;

        $this->ledger->deleteEntry($internalLedgerEntry, $reason);

        return response()->json(null, 204);
    }

    /** Sets a party's opening balance — a starting position, not an entry. */
    public function setOpening(Request $request, Customer $customer)
    {
        $data = $request->validate([
            // Signed: positive means the party owes us, matching the entries
            // and the receivables ledger's own convention.
            'opening_balance' => ['required', 'numeric', 'between:-999999999999,999999999999'],
            'as_of' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        return response()->json($this->ledger->setOpeningBalance($customer, $data));
    }

    /**
     * @return array<string, mixed>
     */
    private function validateEntry(Request $request): array
    {
        return $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'date' => ['required', 'date'],
            'details' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:80'],
            // Both are optional individually; the service enforces that
            // exactly one of them carries an amount, so the rule lives with
            // the ledger rather than only with this request.
            'debit' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'credit' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'reason' => ['nullable', 'string', 'max:255'],
            'expected_updated_at' => ['nullable', 'string'],
        ]);
    }

    private function present(CustomerInternalLedgerEntry $entry): array
    {
        return array_merge($entry->toArray(), [
            'customer_name' => $entry->customer?->name,
            'entry_no' => $entry->reference_label,
        ]);
    }
}
