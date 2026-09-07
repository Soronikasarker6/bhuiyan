<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MeshSize;
use Illuminate\Http\Request;

/** Global mesh/grind catalog — one bag_kg shared across every raw material. */
class MeshSizeController extends Controller
{
    public function index()
    {
        return MeshSize::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:40'],
            'bag_kg' => ['required', 'numeric', 'gt:0'],
            'active' => ['boolean'],
        ]);

        return response()->json(MeshSize::create($data), 201);
    }

    public function update(Request $request, MeshSize $meshSize)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:40'],
            'bag_kg' => ['required', 'numeric', 'gt:0'],
            'active' => ['boolean'],
        ]);

        $meshSize->update($data);

        return $meshSize;
    }

    public function destroy(MeshSize $meshSize)
    {
        return $this->guardedDelete(
            fn () => $meshSize->delete(),
            'This mesh size is still referenced by production or sales — deactivate it instead of deleting.'
        );
    }
}
