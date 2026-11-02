<?php

namespace Tests\Unit;

use App\Support\Weighbridge;
use PHPUnit\Framework\TestCase;

class WeighbridgeTest extends TestCase
{
    public function test_net_is_gross_minus_tare_in_kg_and_tons(): void
    {
        $this->assertSame(20_000.0, Weighbridge::netKg(32_450, 12_450));
        $this->assertSame(20.0, Weighbridge::netTon(32_450, 12_450));
    }

    public function test_decimals_are_exact_to_the_kg_columns(): void
    {
        $this->assertSame(5137.35, Weighbridge::netKg('18237.55', '13100.20'));
        $this->assertEqualsWithDelta(5.13735, Weighbridge::netTon(18_237.55, 13_100.20), 1e-12);
    }

    public function test_a_missing_weight_never_becomes_zero(): void
    {
        $this->assertNull(Weighbridge::netKg(null, null));
        $this->assertNull(Weighbridge::netKg(18_000, null));
        $this->assertNull(Weighbridge::netKg(null, 13_000));
        $this->assertNull(Weighbridge::netKg('', 13_000));
        $this->assertNull(Weighbridge::netTon(18_000, null));
        $this->assertSame(0.0, Weighbridge::netKg(0, 0), 'a recorded zero is still a value');
    }
}
