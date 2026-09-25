<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Services\AuditLogger;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Http\Request;

/** Soft-deleted so a transaction's category_id (+ its category_name snapshot) never dangles. */
class CategoryController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    public function index()
    {
        return Category::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'direction' => ['required', 'in:in,out'],
            'expense_type' => ['nullable', 'in:company_expense,excluded'],
        ]);

        $data = $this->normalizeExpenseType($data, 'company_expense');
        $category = Category::create($data);

        $this->audit->record(AuditEntity::CATEGORY, $category->id, AuditAction::CREATE, [
            'record' => $category->name,
            'after' => $this->audit->snapshot($category),
            'summary' => "Added {$category->direction} category {$category->name}",
        ]);

        return response()->json($category, 201);
    }

    public function update(Request $request, Category $category)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'direction' => ['required', 'in:in,out'],
            'expense_type' => ['nullable', 'in:company_expense,excluded'],
        ]);

        // Falls back to whatever the category already had, not a hardcoded
        // default — a client that resends name+direction without touching
        // expense_type (nothing does today, but nothing should have to)
        // must not silently un-exclude a category someone had marked
        // Excluded.
        $data = $this->normalizeExpenseType($data, $category->expense_type ?? 'company_expense');
        $before = $this->audit->snapshot($category);
        $category->update($data);

        $this->audit->recordUpdate(
            AuditEntity::CATEGORY,
            $category->id,
            $before,
            $category->refresh(),
            ['record' => $category->name],
        );

        return $category;
    }

    /**
     * `expense_type` only ever means something for a Cash Out category — a
     * Cash In one is never a candidate for Profit & Loss's "Company Costs",
     * so it's forced null there rather than trusting whatever the client
     * sent. An 'out' category with nothing specified falls back to
     * `$default` (a fresh 'company_expense' on create, the category's own
     * current value on update).
     */
    private function normalizeExpenseType(array $data, string $default): array
    {
        $data['expense_type'] = $data['direction'] === 'out'
            ? ($data['expense_type'] ?? $default)
            : null;

        return $data;
    }

    public function destroy(Category $category)
    {
        $before = $this->audit->snapshot($category);
        $name = $category->name;

        $category->delete();

        $this->audit->record(AuditEntity::CATEGORY, $category->id, AuditAction::DELETE, [
            'record' => $name,
            'before' => $before,
            'summary' => "Retired category {$name}",
        ]);

        return response()->json(null, 204);
    }
}
