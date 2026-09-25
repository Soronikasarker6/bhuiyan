<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditLogger;
use App\Services\BackupService;
use App\Support\AuditAction;
use App\Support\AuditEntity;

class BackupController extends Controller
{
    public function __construct(
        private BackupService $backup,
        private AuditLogger $audit,
    ) {}

    public function export()
    {
        return response()->json($this->backup->exportAll());
    }

    /**
     * Note the ordering: `resetToSeed()` runs `migrate:fresh`, which drops and
     * rebuilds every table including `audit_logs`, so an audit row written
     * before it would not survive. It is recorded afterwards instead — the
     * first entry in the new history is the reset that created it, which is
     * the honest account of what happened.
     */
    public function reset()
    {
        $this->backup->resetToSeed();

        $this->audit->record(AuditEntity::SYSTEM, null, AuditAction::DATA_RESET, [
            'record' => 'Restore sample data',
            'summary' => 'Wiped all data and restored the sample dataset',
            'metadata' => ['scope' => 'full-reset', 'audit_history_cleared' => true],
        ]);

        return response()->json(['message' => 'Restored sample data.']);
    }

    public function clearTransactional()
    {
        $this->audit->record(AuditEntity::SYSTEM, null, AuditAction::DATA_RESET, [
            'record' => 'Clear all entries',
            'summary' => 'Cleared every transactional entry, keeping accounts, categories and mesh sizes',
            'metadata' => ['scope' => 'transactional'],
        ]);

        $this->backup->clearTransactionalData();

        return response()->json(['message' => 'Cleared all transactional entries.']);
    }
}
