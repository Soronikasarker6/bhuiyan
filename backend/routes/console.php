<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Housekeeping only: an expired token is already refused on use by
// SessionPolicy. This just removes rows for sign-ins nobody came back to
// (a browser closed mid-session), a day after they expired.
Schedule::command('sanctum:prune-expired --hours=24')->daily();
