<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class AccountFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => $this->faker->unique()->company().' Account',
            'kind' => $this->faker->randomElement(['cash', 'bank']),
            'system' => false,
        ];
    }
}
