<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AppDataController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\LedgerClosingController;
use App\Http\Controllers\Api\MeshSizeController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductionEntryController;
use App\Http\Controllers\Api\ProductStockController;
use App\Http\Controllers\Api\RawMaterialController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\ShipmentController;
use App\Http\Controllers\Api\ShipmentCycleController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\UnitOfMeasureController;
use App\Http\Controllers\Api\WastageEntryController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/app-data', [AppDataController::class, 'index']);

    Route::apiResource('products', ProductController::class)->except('show');
    Route::apiResource('mesh-sizes', MeshSizeController::class)->except('show');
    Route::apiResource('units-of-measure', UnitOfMeasureController::class)->except('show');
    Route::apiResource('accounts', AccountController::class)->except('show');
    Route::get('accounts/{account}/balance', [AccountController::class, 'balance']);
    Route::apiResource('categories', CategoryController::class)->except('show');

    Route::apiResource('customers', CustomerController::class);
    Route::get('customers/{customer}/ledger', [CustomerController::class, 'ledger']);
    Route::post('customers/{customer}/payments', [CustomerController::class, 'payments']);

    Route::get('raw-materials', [RawMaterialController::class, 'index']);
    Route::get('raw-materials/{product}/stock', [RawMaterialController::class, 'stock']);

    Route::apiResource('shipments', ShipmentController::class)->except('show');
    Route::post('shipments/{shipment}/close', [ShipmentController::class, 'close']);
    Route::post('shipments/{shipment}/reopen', [ShipmentController::class, 'reopen']);
    Route::get('shipment-cycles', [ShipmentCycleController::class, 'index']);

    Route::apiResource('wastage-entries', WastageEntryController::class)->only(['index', 'store', 'destroy']);

    Route::apiResource('production-entries', ProductionEntryController::class)->only(['index', 'store', 'destroy']);
    Route::get('products/{product}/mesh-stock', [ProductStockController::class, 'meshStock']);
    Route::get('products/{product}/stock-ledger', [ProductStockController::class, 'stockLedger']);

    Route::get('sales/next-invoice-no', [SaleController::class, 'nextInvoiceNo']);
    Route::apiResource('sales', SaleController::class)->only(['index', 'show', 'store', 'destroy']);

    Route::post('transactions/transfer', [TransactionController::class, 'transfer']);
    Route::apiResource('transactions', TransactionController::class)->only(['index', 'store', 'destroy']);

    Route::apiResource('ledger-closings', LedgerClosingController::class)->only(['index', 'store', 'destroy']);

    Route::prefix('reports')->group(function () {
        Route::get('production', [ReportController::class, 'production']);
        Route::get('sales', [ReportController::class, 'sales']);
        Route::get('inventory', [ReportController::class, 'inventory']);
        Route::get('shipments', [ReportController::class, 'shipments']);
        Route::get('wastage', [ReportController::class, 'wastage']);
        Route::get('customer-due', [ReportController::class, 'customerDue']);
        Route::get('customer-ledger', [ReportController::class, 'customerLedger']);
        Route::get('payments', [ReportController::class, 'payments']);
        Route::get('product-wise', [ReportController::class, 'productWise']);
        Route::get('mesh-wise', [ReportController::class, 'meshWise']);
        Route::get('pnl', [ReportController::class, 'pnl']);
        Route::get('cash-ledger', [ReportController::class, 'cashLedger']);
        Route::get('bank-ledger', [ReportController::class, 'bankLedger']);
    });

    Route::get('dashboard/summary', [DashboardController::class, 'summary']);

    Route::prefix('backup')->group(function () {
        Route::get('export', [BackupController::class, 'export']);
        Route::post('reset', [BackupController::class, 'reset']);
        Route::post('clear-transactional', [BackupController::class, 'clearTransactional']);
    });
});
