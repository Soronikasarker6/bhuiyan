<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class ProductFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => $this->faker->unique()->words(3, true).' Limestone',
            'code' => strtoupper($this->faker->unique()->bothify('PRD-###')),
            'unit' => 'Ton',
            'active' => true,
        ];
    }
}
