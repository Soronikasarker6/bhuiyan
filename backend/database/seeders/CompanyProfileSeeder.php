<?php

namespace Database\Seeders;

use App\Models\CompanyProfile;
use Illuminate\Database\Seeder;

class CompanyProfileSeeder extends Seeder
{
    /** `current()` is itself idempotent (see CompanyProfile), but this makes the seed explicit rather than lazy. */
    public function run(): void
    {
        CompanyProfile::current();
    }
}
