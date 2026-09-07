<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\UnitOfMeasure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UnitOfMeasureController extends Controller
{
    public function index()
    {
        return UnitOfMeasure::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:40', 'unique:units_of_measure,name'],
        ]);

        return response()->json(UnitOfMeasure::create($data), 201);
    }

    /** Renaming cascades to every product currently using the old name (string match). */
    public function update(Request $request, UnitOfMeasure $unitOfMeasure)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:40', 'unique:units_of_measure,name,'.$unitOfMeasure->id],
        ]);

        DB::transaction(function () use ($unitOfMeasure, $data) {
            $oldName = $unitOfMeasure->name;
            $unitOfMeasure->update($data);
            Product::where('unit', $oldName)->update(['unit' => $data['name']]);
        });

        return $unitOfMeasure->fresh();
    }

    public function destroy(UnitOfMeasure $unitOfMeasure)
    {
        $unitOfMeasure->delete();

        return response()->json(null, 204);
    }
}
