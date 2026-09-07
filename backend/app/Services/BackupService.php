<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\LedgerClosing;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\RawMaterialImport;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Transaction;
use App\Models\UnitOfMeasure;
use App\Models\WastageEntry;
use Database\Seeders\DemoDataSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Ported from src/services/repository.ts (exportBackup/reset/clearTransactionalData).
 * Restricted to the authenticated admin — see routes/api.php.
 */
class BackupService
{
    /** Full JSON dump of every table, parity with the current "Download backup". */
    public function exportAll(): array
    {
        return [
            'exported_at' => now()->toIso8601String(),
            'data' => [
                'products' => Product::all(),
                'mesh_sizes' => MeshSize::all(),
                'units_of_measure' => UnitOfMeasure::all(),
                'customers' => Customer::all(),
                'accounts' => Account::all(),
                'categories' => Category::withTrashed()->get(),
                'raw_material_imports' => RawMaterialImport::all(),
                'wastage_entries' => WastageEntry::all(),
                'production_entries' => ProductionEntry::all(),
                'sales' => Sale::all(),
                'sale_items' => SaleItem::all(),
                'customer_transactions' => CustomerTransaction::all(),
                'transactions' => Transaction::all(),
                'ledger_closings' => LedgerClosing::with('balances')->get(),
            ],
        ];
    }

    /** Wipes transactional data, keeps master/config data — mirrors clearTransactionalData(). */
    public function clearTransactionalData(): void
    {
        DB::transaction(function () {
            foreach ([
                'inventory_transactions', 'customer_transactions', 'sale_items', 'sales',
                'ledger_closing_balances', 'ledger_closings', 'transactions',
                'production_entries', 'wastage_entries', 'raw_material_imports',
            ] as $table) {
                DB::table($table)->delete();
            }
        });
    }

    /** Wipes everything and re-seeds master data + the sample shipment/production/sales dataset. */
    public function resetToSeed(): void
    {
        Artisan::call('migrate:fresh', ['--seed' => true]);
        Artisan::call('db:seed', ['--class' => DemoDataSeeder::class]);
    }
}
