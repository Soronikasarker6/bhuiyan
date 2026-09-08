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
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductionEntryController;
use App\Http\Controllers\Api\ProductStockController;
use App\Http\Controllers\Api\RawMaterialController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\ShipmentController;
use App\Http\Controllers\Api\ShipmentCycleController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\UnitOfMeasureController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WastageEntryController;
use App\Support\Permissions as P;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // The shared read bootstrap every page needs — reachable by any
    // authenticated user; the frontend hides pages/nav/actions and every
    // mutating endpoint below is permission-gated, matching how this app's
    // spec describes "what the user can see" vs. "what the user can do".
    Route::get('/app-data', [AppDataController::class, 'index']);

    Route::apiResource('products', ProductController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::RAW_MATERIAL_VIEW)
        ->middlewareFor('store', 'permission:'.P::RAW_MATERIAL_CREATE)
        ->middlewareFor('update', 'permission:'.P::RAW_MATERIAL_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::RAW_MATERIAL_DELETE);

    Route::apiResource('mesh-sizes', MeshSizeController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::RAW_MATERIAL_VIEW)
        ->middlewareFor('store', 'permission:'.P::RAW_MATERIAL_CREATE)
        ->middlewareFor('update', 'permission:'.P::RAW_MATERIAL_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::RAW_MATERIAL_DELETE);

    Route::apiResource('units-of-measure', UnitOfMeasureController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::SETTINGS_VIEW)
        ->middlewareFor(['store', 'update'], 'permission:'.P::SETTINGS_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::SETTINGS_EDIT);

    Route::apiResource('accounts', AccountController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::SETTINGS_VIEW)
        ->middlewareFor(['store', 'update'], 'permission:'.P::SETTINGS_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::SETTINGS_EDIT);
    Route::get('accounts/{account}/balance', [AccountController::class, 'balance'])
        ->middleware('permission:'.P::SETTINGS_VIEW);

    Route::apiResource('categories', CategoryController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::SETTINGS_VIEW)
        ->middlewareFor(['store', 'update'], 'permission:'.P::SETTINGS_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::SETTINGS_EDIT);

    Route::apiResource('customers', CustomerController::class)
        ->middlewareFor(['index', 'show'], 'permission:'.P::CUSTOMERS_VIEW)
        ->middlewareFor('store', 'permission:'.P::CUSTOMERS_CREATE)
        ->middlewareFor('update', 'permission:'.P::CUSTOMERS_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::CUSTOMERS_DELETE);
    Route::get('customers/{customer}/ledger', [CustomerController::class, 'ledger'])
        ->middleware('permission:'.P::CUSTOMER_LEDGER_VIEW);
    Route::post('customers/{customer}/payments', [CustomerController::class, 'payments'])
        ->middleware('permission:'.P::CASH_IN_CREATE);

    Route::middleware('permission:'.P::RAW_MATERIAL_VIEW)->group(function () {
        Route::get('raw-materials', [RawMaterialController::class, 'index']);
        Route::get('raw-materials/{product}/stock', [RawMaterialController::class, 'stock']);
        Route::get('shipment-cycles', [ShipmentCycleController::class, 'index']);
    });

    Route::apiResource('shipments', ShipmentController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::RAW_MATERIAL_VIEW)
        ->middlewareFor('store', 'permission:'.P::RAW_MATERIAL_CREATE)
        ->middlewareFor('update', 'permission:'.P::RAW_MATERIAL_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::RAW_MATERIAL_DELETE);
    Route::post('shipments/{shipment}/close', [ShipmentController::class, 'close'])
        ->middleware('permission:'.P::RAW_MATERIAL_EDIT);
    Route::post('shipments/{shipment}/reopen', [ShipmentController::class, 'reopen'])
        ->middleware('permission:'.P::RAW_MATERIAL_EDIT);

    Route::apiResource('wastage-entries', WastageEntryController::class)->only(['index', 'store', 'destroy'])
        ->middlewareFor('index', 'permission:'.P::RAW_MATERIAL_VIEW)
        ->middlewareFor('store', 'permission:'.P::RAW_MATERIAL_CREATE)
        ->middlewareFor('destroy', 'permission:'.P::RAW_MATERIAL_DELETE);

    Route::apiResource('production-entries', ProductionEntryController::class)->only(['index', 'store', 'destroy'])
        ->middlewareFor('index', 'permission:'.P::PRODUCTION_VIEW)
        ->middlewareFor('store', 'permission:'.P::PRODUCTION_CREATE)
        ->middlewareFor('destroy', 'permission:'.P::PRODUCTION_DELETE);
    Route::middleware('permission:'.P::PRODUCTION_VIEW)->group(function () {
        Route::get('products/{product}/mesh-stock', [ProductStockController::class, 'meshStock']);
        Route::get('products/{product}/stock-ledger', [ProductStockController::class, 'stockLedger']);
    });

    Route::get('sales/next-invoice-no', [SaleController::class, 'nextInvoiceNo'])
        ->middleware('permission:'.P::SALES_VIEW);
    Route::apiResource('sales', SaleController::class)->only(['index', 'show', 'store', 'destroy'])
        ->middlewareFor(['index', 'show'], 'permission:'.P::SALES_VIEW)
        ->middlewareFor('store', 'permission:'.P::SALES_CREATE)
        ->middlewareFor('destroy', 'permission:'.P::SALES_DELETE);

    Route::post('transactions/transfer', [TransactionController::class, 'transfer'])
        ->middleware('permission:'.P::LEDGER_CREATE);
    Route::apiResource('transactions', TransactionController::class)->only(['index', 'store', 'destroy'])
        ->middlewareFor('index', 'permission:'.P::LEDGER_VIEW)
        ->middlewareFor('store', 'permission:'.P::LEDGER_CREATE)
        ->middlewareFor('destroy', 'permission:'.P::LEDGER_DELETE);

    Route::apiResource('ledger-closings', LedgerClosingController::class)->only(['index', 'store', 'destroy'])
        ->middlewareFor('index', 'permission:'.P::CLOSING_VIEW)
        ->middlewareFor(['store', 'destroy'], 'permission:'.P::CLOSING_CREATE);

    Route::middleware('permission:'.P::REPORTS_VIEW)->prefix('reports')->group(function () {
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

    Route::get('dashboard/summary', [DashboardController::class, 'summary'])
        ->middleware('permission:'.P::DASHBOARD_VIEW);

    Route::middleware('permission:'.P::SETTINGS_EDIT)->prefix('backup')->group(function () {
        Route::get('export', [BackupController::class, 'export']);
        Route::post('reset', [BackupController::class, 'reset']);
        Route::post('clear-transactional', [BackupController::class, 'clearTransactional']);
    });

    // -------------------------------------------------------------- Users & Roles
    Route::apiResource('users', UserController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::USERS_VIEW)
        ->middlewareFor('store', 'permission:'.P::USERS_CREATE)
        ->middlewareFor('update', 'permission:'.P::USERS_EDIT)
        ->middlewareFor('destroy', 'permission:'.P::USERS_DELETE);
    Route::post('users/{user}/toggle-active', [UserController::class, 'toggleActive'])
        ->middleware('permission:'.P::USERS_EDIT);
    Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword'])
        ->middleware('permission:'.P::USERS_EDIT);

    Route::apiResource('roles', RoleController::class)->except('show')
        ->middlewareFor('index', 'permission:'.P::ROLES_VIEW)
        ->middlewareFor(['store', 'update', 'destroy'], 'permission:'.P::ROLES_EDIT);
    Route::get('permissions', [PermissionController::class, 'index'])
        ->middleware('permission:'.P::ROLES_VIEW);
});
