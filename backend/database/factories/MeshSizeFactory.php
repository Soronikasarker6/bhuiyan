<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class MeshSizeFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => (string) $this->faker->unique()->numberBetween(100, 2000),
            'bag_kg' => 50,
            'active' => true,
        ];
    }
}
