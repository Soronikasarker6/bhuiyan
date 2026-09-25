<?php

use App\Services\AuditLogger;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The one audit table for the whole system — every important business
     * action, from every module, lands here through {@see AuditLogger}.
     * There is deliberately no per-module audit table: "who changed what, when,
     * from what to what" is the same question regardless of which screen asked
     * it, and one table is what makes a single Audit History screen possible.
     *
     * Rows are append-only. The model refuses updates and deletes (see
     * App\Models\AuditLog) and no endpoint exposes either.
     *
     * `performed_by_user_name` is a *snapshot*, not a join: an audit row must
     * still say who did something after that user is renamed or removed, which
     * is exactly when the history matters most. `performed_by_user_id` keeps
     * the link for the "filter by user" dropdown and nulls out if the account
     * is later deleted.
     *
     * `entity_id` is a string so one column can hold a numeric primary key
     * ("123"), a transfer's UUID, or a singleton's key ("company-profile").
     */
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('entity_type', 64);
            $table->string('entity_id', 64)->nullable();
            $table->string('action', 32);
            // Denormalised from entity_type (see AuditEntity::MODULES) so the
            // Module filter and the CSV export never need a lookup table.
            $table->string('module', 64);
            // What the record is called in business terms — TX-000123, PAY-023,
            // INV-2026-004 — rather than its database id.
            $table->string('record_label', 120)->nullable();
            $table->string('summary', 255)->nullable();
            $table->foreignId('performed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('performed_by_user_name', 150);
            $table->timestamp('performed_at', 3);
            $table->json('before_data')->nullable();
            $table->json('after_data')->nullable();
            $table->string('reason', 255)->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at', 3)->nullable();

            // "Everything that ever happened to TX-000123", the history view.
            $table->index(['entity_type', 'entity_id']);
            // The default listing is newest-first across everything.
            $table->index('performed_at');
            // One index per filter the Audit History screen offers.
            $table->index('performed_by_user_id');
            $table->index('action');
            $table->index('module');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
