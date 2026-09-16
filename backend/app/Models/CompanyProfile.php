<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * The single source of truth for the business's own identity — who it is,
 * what it does, who answers for it, and how to reach it. Every printed
 * document (invoice, register, report) reads this instead of carrying its
 * own copy, so a change here reaches every future document at once and
 * never leaves one PDF disagreeing with another.
 *
 * A singleton by convention, not by schema constraint: `current()` is the
 * only way the rest of the app touches this model, and it always resolves
 * to the same one row (creating it, seeded with sensible defaults, the
 * first time anything asks). There is deliberately no route to create a
 * second row.
 */
class CompanyProfile extends Model
{
    protected $fillable = [
        'name', 'tagline', 'owner_name', 'designation',
        'phone', 'email', 'address', 'website', 'logo_path',
    ];

    protected $hidden = ['logo_path'];

    protected $appends = ['logo_url'];

    public static function current(): self
    {
        return static::query()->first() ?? static::create([
            'name' => 'BHUIYAN INDUSTRY',
            'tagline' => 'Agro-Based Limestone Manufacturing Company',
            'owner_name' => 'Aminul Islam Bhuiyan',
            'designation' => 'Founder & CEO',
        ]);
    }

    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? Storage::disk('public')->url($this->logo_path) : null;
    }
}
