<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;

/** Soft-deleted so a transaction's category_id (+ its category_name snapshot) never dangles. */
class CategoryController extends Controller
{
    public function index()
    {
        return Category::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'direction' => ['required', 'in:in,out'],
        ]);

        return response()->json(Category::create($data), 201);
    }

    public function update(Request $request, Category $category)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'direction' => ['required', 'in:in,out'],
        ]);

        $category->update($data);

        return $category;
    }

    public function destroy(Category $category)
    {
        $category->delete();

        return response()->json(null, 204);
    }
}
