<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MeshSize extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'bag_kg', 'active'];

    protected function casts(): array
    {
        return [
            'bag_kg' => 'float',
            'active' => 'boolean',
        ];
    }
}
