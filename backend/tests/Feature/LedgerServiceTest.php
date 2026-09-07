<?php

namespace Tests\Feature;

use App\Exceptions\BusinessRuleException;
use App\Models\Account;
use App\Models\Transaction;
use App\Services\LedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LedgerServiceTest extends TestCase
{
    use RefreshDatabase;

    private LedgerService $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ledger = app(LedgerService::class);
    }

    public function test_transfer_writes_two_linked_rows_and_moves_both_balances(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);
        $bank = Account::factory()->create(['kind' => 'bank']);

        Transaction::create(['date' => '2026-01-01', 'account_id' => $cash->id, 'direction' => 'in', 'amount' => 50000]);

        [$out, $in] = $this->ledger->transfer([
            'date' => '2026-01-02', 'from_account_id' => $cash->id, 'to_account_id' => $bank->id, 'amount' => 20000,
        ]);

        $this->assertNotNull($out->transfer_id);
        $this->assertSame($out->transfer_id, $in->transfer_id);

        $balances = $this->ledger->accountBalances()->keyBy('account_id');
        $this->assertEqualsWithDelta(30000.0, $balances[$cash->id]['balance'], 0.01);
        $this->assertEqualsWithDelta(20000.0, $balances[$bank->id]['balance'], 0.01);
    }

    public function test_deleting_one_transfer_leg_deletes_both(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);
        $bank = Account::factory()->create(['kind' => 'bank']);
        Transaction::create(['date' => '2026-01-01', 'account_id' => $cash->id, 'direction' => 'in', 'amount' => 50000]);

        [$out] = $this->ledger->transfer([
            'date' => '2026-01-02', 'from_account_id' => $cash->id, 'to_account_id' => $bank->id, 'amount' => 20000,
        ]);

        $this->ledger->deleteTransaction($out->id);

        $this->assertSame(0, Transaction::where('transfer_id', $out->transfer_id)->count());
    }

    public function test_cannot_transfer_an_account_to_itself(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);

        $this->expectException(BusinessRuleException::class);
        $this->ledger->transfer(['date' => '2026-01-01', 'from_account_id' => $cash->id, 'to_account_id' => $cash->id, 'amount' => 100]);
    }

    public function test_month_cannot_be_closed_twice_or_without_activity(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);

        $this->expectException(BusinessRuleException::class);
        $this->ledger->closeMonth('2026-05'); // no activity at all
    }

    public function test_closing_a_month_snapshots_balances_and_blocks_a_repeat(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);
        Transaction::create(['date' => '2026-05-10', 'account_id' => $cash->id, 'direction' => 'in', 'amount' => 10000]);
        Transaction::create(['date' => '2026-05-15', 'account_id' => $cash->id, 'direction' => 'out', 'amount' => 4000]);

        $closing = $this->ledger->closeMonth('2026-05');
        $this->assertEqualsWithDelta(6000.0, (float) $closing->cash_total, 0.01);
        $this->assertEqualsWithDelta(6000.0, (float) $closing->net_movement, 0.01);

        $this->expectException(BusinessRuleException::class);
        $this->ledger->closeMonth('2026-05');
    }

    public function test_system_account_cannot_be_deleted(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash', 'system' => true]);

        $this->expectException(BusinessRuleException::class);
        $this->ledger->deleteAccount($cash->id);
    }
}
