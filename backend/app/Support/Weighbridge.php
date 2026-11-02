<?php

namespace App\Support;

/**
 * The one weighbridge calculation, for every sale type:
 *
 *     Net Weight (KG)  = Gross Weight (KG) − Tare Weight (KG)
 *     Net Weight (TON) = Net Weight (KG) ÷ 1000
 *
 * Null in, null out: a slip missing either figure has no net weight, and
 * nothing here turns a missing value into 0. Net kg is rounded to the 2
 * decimals the kg columns hold, which only clears float noise
 * (5137.3499… → 5137.35).
 *
 * This is the truck's measured weight — never the billable ton on a sale's
 * lines, which amounts, ledgers, stock and COGS keep reading. (A raw material
 * sale is billed on this net, but that is SalesService copying it onto the
 * line once, not a second calculation.) Mirrored by src/utils/weighbridge.ts.
 */
final class Weighbridge
{
    public static function netKg(int|float|string|null $grossKg, int|float|string|null $tareKg): ?float
    {
        if ($grossKg === null || $grossKg === '' || $tareKg === null || $tareKg === '') {
            return null;
        }

        return round((float) $grossKg - (float) $tareKg, 2);
    }

    public static function kgToTon(?float $kg): ?float
    {
        return $kg === null ? null : $kg / 1000;
    }

    /** Net tons straight from a slip — null unless both weights are present. */
    public static function netTon(int|float|string|null $grossKg, int|float|string|null $tareKg): ?float
    {
        return self::kgToTon(self::netKg($grossKg, $tareKg));
    }
}
