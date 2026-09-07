<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BackupService;

class BackupController extends Controller
{
    public function __construct(private BackupService $backup) {}

    public function export()
    {
        return response()->json($this->backup->exportAll());
    }

    public function reset()
    {
        $this->backup->resetToSeed();

        return response()->json(['message' => 'Restored sample data.']);
    }

    public function clearTransactional()
    {
        $this->backup->clearTransactionalData();

        return response()->json(['message' => 'Cleared all transactional entries.']);
    }
}
