<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\Transaction;
use App\Models\WastageEntry;
use App\Services\CustomerLedgerService;
use App\Services\InventoryService;
use App\Services\SalesService;
use Illuminate\Database\Seeder;

/**
 * Opt-in demo dataset — NOT run by the default `db:seed` — for a realistic dev
 * environment. Ported from the frontend's src/data/seed.ts. Run with:
 *   php artisan db:seed --class=Database\\Seeders\\DemoDataSeeder
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([ProductSeeder::class, MeshSizeSeeder::class, UnitOfMeasureSeeder::class, AccountSeeder::class, CategorySeeder::class]);

        $inventory = app(InventoryService::class);
        $sales = app(SalesService::class);
        $ledger = app(CustomerLedgerService::class);

        $vwl = Product::where('code', 'VWL')->firstOrFail();
        $orl = Product::where('code', 'ORL')->firstOrFail();
        $grl = Product::where('code', 'GRL')->firstOrFail();
        $mesh250 = MeshSize::where('name', '250')->firstOrFail();
        $mesh400 = MeshSize::where('name', '400')->firstOrFail();
        $cash = Account::where('name', 'Cash')->firstOrFail();

        $abc = Customer::firstOrCreate(['name' => 'ABC Trading'], ['opening_balance' => 0, 'active' => true]);
        $meghna = Customer::firstOrCreate(['name' => 'Meghna Glass Works'], ['opening_balance' => 20000, 'active' => true]);
        $dhaka = Customer::firstOrCreate(['name' => 'Dhaka Ceramics Ltd'], ['opening_balance' => 0, 'active' => true]);

        if ($meghna->wasRecentlyCreated) {
            CustomerTransaction::create([
                'customer_id' => $meghna->id,
                'date' => '2026-08-01',
                'type' => 'opening_balance',
                'reference' => $ledger->nextReference('opening_balance'),
                'description' => 'Opening balance',
                'debit' => 20000,
                'credit' => 0,
            ]);
        }

        // --- Shipments -----------------------------------------------------
        $inventory->receiveStock(['date' => '2026-08-01', 'product_id' => $vwl->id, 'ship_name' => 'MV Ocean Pearl', 'gross_weight_kg' => 21000, 'tare_weight_kg' => 1000, 'price_per_ton' => 3200]);
        $inventory->receiveStock(['date' => '2026-08-01', 'product_id' => $orl->id, 'ship_name' => 'MV Gulf Star', 'gross_weight_kg' => 16500, 'tare_weight_kg' => 500, 'price_per_ton' => 3600]);
        $inventory->receiveStock(['date' => '2026-08-02', 'product_id' => $grl->id, 'ship_name' => 'MV Bay Runner', 'gross_weight_kg' => 12500, 'tare_weight_kg' => 500, 'price_per_ton' => 2900]);

        // --- Wastage --------------------------------------------------------
        $inventory->consumeStock($vwl->id, 'wastage', '2026-08-05', 150 / 1000, fn () => WastageEntry::create([
            'date' => '2026-08-05', 'product_id' => $vwl->id, 'quantity_kg' => 150, 'reason' => 'Handling loss',
        ]));
        $inventory->consumeStock($grl->id, 'wastage', '2026-08-06', 80 / 1000, fn () => WastageEntry::create([
            'date' => '2026-08-06', 'product_id' => $grl->id, 'quantity_kg' => 80, 'reason' => 'Spillage',
        ]));

        // --- Production (bagging) -------------------------------------------
        $produce = function (Product $product, MeshSize $mesh, string $date, int $bags) use ($inventory) {
            $tons = ($bags * (float) $mesh->bag_kg) / 1000;
            $inventory->consumeStock($product->id, 'production', $date, $tons, fn () => ProductionEntry::create([
                'date' => $date, 'product_id' => $product->id, 'mesh_id' => $mesh->id, 'bags' => $bags,
            ]));
        };

        $produce($vwl, $mesh250, '2026-08-10', 300);
        $produce($vwl, $mesh400, '2026-08-12', 50);
        $produce($orl, $mesh250, '2026-08-11', 200);
        $produce($grl, $mesh250, '2026-08-12', 150);

        // --- Sales ------------------------------------------------------------
        $sales->createSale([
            'date' => '2026-08-15', 'customer_id' => $abc->id,
            'paid_at_sale' => 25000,
            'items' => [['product_id' => $vwl->id, 'mesh_size_id' => $mesh250->id, 'bags' => 100, 'rate_per_ton' => 5000]],
        ]);
        $sales->createSale([
            'date' => '2026-08-18', 'customer_id' => $meghna->id,
            'paid_at_sale' => 20000,
            'items' => [['product_id' => $orl->id, 'mesh_size_id' => $mesh250->id, 'bags' => 120, 'rate_per_ton' => 5500]],
        ]);
        $sales->createSale([
            'date' => '2026-08-20', 'customer_id' => $dhaka->id,
            'paid_at_sale' => 0,
            'items' => [['product_id' => $grl->id, 'mesh_size_id' => $mesh250->id, 'bags' => 80, 'rate_per_ton' => 4800]],
        ]);
        $sales->createSale([
            'date' => '2026-08-25', 'customer_id' => $abc->id,
            'paid_at_sale' => 0,
            'items' => [['product_id' => $vwl->id, 'mesh_size_id' => $mesh250->id, 'bags' => 200, 'rate_per_ton' => 5000]],
        ]);

        // --- A standalone payment (not tied to any one invoice) ---------------
        $ledger->recordPayment([
            'customer_id' => $abc->id, 'date' => '2026-08-28', 'amount' => 20000,
            'method' => 'Cash', 'account_id' => $cash->id, 'description' => 'Cash received on account',
        ]);

        // --- Company running costs (Cash & Bank ledger, "out") -----------------
        foreach ([
            ['date' => '2026-08-15', 'category' => 'Labour Bill', 'amount' => 8000],
            ['date' => '2026-08-16', 'category' => 'Electricity Bill', 'amount' => 3500],
            ['date' => '2026-08-18', 'category' => 'Freight & Transport', 'amount' => 6000],
            ['date' => '2026-08-20', 'category' => 'Office Cost', 'amount' => 2500],
        ] as $cost) {
            $category = Category::where('name', $cost['category'])->where('direction', 'out')->first();
            Transaction::create([
                'date' => $cost['date'], 'details' => $cost['category'], 'account_id' => $cash->id,
                'direction' => 'out', 'category_id' => $category?->id, 'category_name' => $cost['category'],
                'amount' => $cost['amount'],
            ]);
        }
    }
}
