<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Splits the conflated "one row = one shipment" model into a real
     * parent (shipments) / child (raw_material_imports) relationship,
     * without losing or reassigning a single existing import.
     *
     * The grouping rule below is exactly what
     * InventoryService::shipmentCycles() already computed on the fly: walk
     * each product's imports oldest first, start a new cycle at the first
     * one or right after a closed one, and fold every consecutive `open`
     * import into that same cycle. A `closed` import becomes its own
     * closed shipment, 1:1 — its frozen closing balance is carried over
     * verbatim (never recomputed), so a historical figure that was already
     * reported never changes because of this migration. Its old single
     * `closing_consumed_ton` blended production and wastage together; this
     * splits that figure into the two separate columns the new schema
     * wants by re-querying `wastage_entries` for that cycle's own window
     * and subtracting — the closing balance itself is untouched either way.
     */
    public function up(): void
    {
        Schema::table('raw_material_imports', function (Blueprint $table) {
            $table->foreignId('shipment_id')->nullable()->after('id')->constrained('shipments')->restrictOnDelete();
        });

        $imports = DB::table('raw_material_imports')
            ->orderBy('product_id')->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get()
            ->groupBy('product_id');

        $now = now();

        foreach ($imports as $productId => $productImports) {
            $openShipmentId = null;

            foreach ($productImports as $index => $import) {
                if ($import->status === 'closed') {
                    $next = $productImports->get($index + 1);
                    $windowEnd = $next ? $next->date : null;

                    $wastageTon = DB::table('wastage_entries')
                        ->where('product_id', $productId)
                        ->where('date', '>=', $import->date)
                        ->when($windowEnd, fn ($q) => $q->where('date', '<', $windowEnd))
                        ->sum('quantity_kg') / 1000;

                    $consumedTon = max(0, (float) $import->closing_consumed_ton - $wastageTon);

                    $shipmentId = DB::table('shipments')->insertGetId([
                        'product_id' => $productId,
                        'opened_on' => $import->date,
                        'status' => 'closed',
                        'closing_opening_ton' => $import->closing_opening_ton,
                        'closing_received_ton' => $import->closing_received_ton,
                        'closing_consumed_ton' => $consumedTon,
                        'closing_wastage_ton' => $wastageTon,
                        'closing_closing_ton' => $import->closing_closing_ton,
                        'closing_closed_at' => $import->closing_closed_at,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                    // A closed import never keeps an open cycle running past it —
                    // the next import for this product (open or closed) starts fresh.
                    $openShipmentId = null;
                } else {
                    if ($openShipmentId === null) {
                        $openShipmentId = DB::table('shipments')->insertGetId([
                            'product_id' => $productId,
                            'opened_on' => $import->date,
                            'status' => 'open',
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    }
                    $shipmentId = $openShipmentId;
                }

                DB::table('raw_material_imports')->where('id', $import->id)->update(['shipment_id' => $shipmentId]);
            }
        }

        Schema::table('raw_material_imports', function (Blueprint $table) {
            $table->dropColumn([
                'status', 'closing_opening_ton', 'closing_received_ton',
                'closing_consumed_ton', 'closing_closing_ton', 'closing_closed_at',
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('raw_material_imports', function (Blueprint $table) {
            $table->enum('status', ['open', 'closed'])->default('open');
            $table->decimal('closing_opening_ton', 15, 3)->nullable();
            $table->decimal('closing_received_ton', 15, 3)->nullable();
            $table->decimal('closing_consumed_ton', 15, 3)->nullable();
            $table->decimal('closing_closing_ton', 15, 3)->nullable();
            $table->dateTime('closing_closed_at')->nullable();
        });

        $imports = DB::table('raw_material_imports')->get();
        foreach ($imports as $import) {
            if (! $import->shipment_id) {
                continue;
            }
            $shipment = DB::table('shipments')->find($import->shipment_id);
            if (! $shipment) {
                continue;
            }
            // The old column blended production + wastage — reconstitute that
            // sum from the two now-separate frozen figures.
            $consumedBlended = ((float) $shipment->closing_consumed_ton) + ((float) $shipment->closing_wastage_ton);

            DB::table('raw_material_imports')->where('id', $import->id)->update([
                'status' => $shipment->status,
                'closing_opening_ton' => $shipment->closing_opening_ton,
                'closing_received_ton' => $shipment->closing_received_ton,
                'closing_consumed_ton' => $shipment->status === 'closed' ? $consumedBlended : null,
                'closing_closing_ton' => $shipment->closing_closing_ton,
                'closing_closed_at' => $shipment->closing_closed_at,
            ]);
        }

        Schema::table('raw_material_imports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shipment_id');
        });
    }
};
