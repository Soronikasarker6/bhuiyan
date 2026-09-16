<?php

namespace Tests\Feature;

use App\Models\CompanyProfile;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Support\Permissions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class CompanyProfileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);

        return $admin;
    }

    /** No seeded role holds SETTINGS_VIEW without SETTINGS_EDIT (Staff/Manager hold neither) — built here to test that split specifically. */
    private function actingAsViewOnly(): User
    {
        $role = Role::firstOrCreate(['name' => 'Settings Viewer', 'guard_name' => 'api']);
        $role->syncPermissions([Permissions::SETTINGS_VIEW]);

        $user = User::factory()->create();
        $user->assignRole($role);
        Sanctum::actingAs($user, ['*']);

        return $user;
    }

    private function actingAsStaff(): User
    {
        $staff = User::factory()->create();
        $staff->assignRole('Staff');
        Sanctum::actingAs($staff, ['*']);

        return $staff;
    }

    public function test_fetching_the_profile_creates_the_one_singleton_row(): void
    {
        $this->actingAsAdmin();

        // 201 the first time — this GET is what lazily creates the singleton
        // row (see CompanyProfile::current()) — 200 on any later fetch.
        $this->getJson('/api/company-profile')
            ->assertSuccessful()
            ->assertJsonPath('name', 'BHUIYAN INDUSTRY')
            ->assertJsonPath('designation', 'Founder & CEO');

        $this->assertSame(1, CompanyProfile::count());
    }

    public function test_admin_can_update_the_profile_and_it_persists(): void
    {
        $this->actingAsAdmin();

        $this->postJson('/api/company-profile', [
            'name' => 'BHUIYAN INDUSTRY',
            'tagline' => 'Agro-Based Limestone Manufacturing Company',
            'owner_name' => 'Aminul Islam Bhuiyan',
            'designation' => 'Founder & CEO',
            'phone' => '+880 1711-000000',
            'email' => 'info@bhuiyanindustry.test',
            'address' => 'Chattogram, Bangladesh',
            'website' => 'https://bhuiyanindustry.test',
        ])->assertOk()->assertJsonPath('phone', '+880 1711-000000');

        $this->assertSame('info@bhuiyanindustry.test', CompanyProfile::current()->email);
    }

    public function test_updating_never_creates_a_second_row(): void
    {
        $this->actingAsAdmin();
        CompanyProfile::current();

        $this->postJson('/api/company-profile', ['name' => 'Renamed Co'])->assertOk();
        $this->postJson('/api/company-profile', ['name' => 'Renamed Co Again'])->assertOk();

        $this->assertSame(1, CompanyProfile::count());
        $this->assertSame('Renamed Co Again', CompanyProfile::current()->name);
    }

    public function test_uploading_a_logo_replaces_the_previous_file(): void
    {
        Storage::fake('public');
        $this->actingAsAdmin();

        $first = UploadedFile::fake()->create('logo.png', 10, 'image/png');
        $this->post('/api/company-profile', [
            'name' => 'BHUIYAN INDUSTRY',
            'logo' => $first,
        ])->assertOk();

        $firstPath = CompanyProfile::current()->logo_path;
        Storage::disk('public')->assertExists($firstPath);

        $second = UploadedFile::fake()->create('logo-2.png', 10, 'image/png');
        $this->post('/api/company-profile', [
            'name' => 'BHUIYAN INDUSTRY',
            'logo' => $second,
        ])->assertOk();

        Storage::disk('public')->assertMissing($firstPath);
        $this->assertNotSame($firstPath, CompanyProfile::current()->logo_path);
    }

    public function test_removing_the_logo_clears_the_file_and_the_column(): void
    {
        Storage::fake('public');
        $this->actingAsAdmin();

        $this->post('/api/company-profile', [
            'name' => 'BHUIYAN INDUSTRY',
            'logo' => UploadedFile::fake()->create('logo.png', 10, 'image/png'),
        ])->assertOk();

        $path = CompanyProfile::current()->logo_path;

        $this->postJson('/api/company-profile', [
            'name' => 'BHUIYAN INDUSTRY',
            'remove_logo' => true,
        ])->assertOk()->assertJsonPath('logo_url', null);

        Storage::disk('public')->assertMissing($path);
        $this->assertNull(CompanyProfile::current()->logo_path);
    }

    public function test_a_view_only_user_can_view_but_not_edit_the_profile(): void
    {
        $this->actingAsViewOnly();

        $this->getJson('/api/company-profile')->assertSuccessful();
        $this->postJson('/api/company-profile', ['name' => 'Hijacked Co'])->assertForbidden();
    }

    public function test_staff_has_no_access_to_the_profile_at_all(): void
    {
        $this->actingAsStaff();

        $this->getJson('/api/company-profile')->assertForbidden();
        $this->postJson('/api/company-profile', ['name' => 'Hijacked Co'])->assertForbidden();
    }

    public function test_a_guest_cannot_view_or_edit_the_profile(): void
    {
        $this->getJson('/api/company-profile')->assertUnauthorized();
        $this->postJson('/api/company-profile', ['name' => 'Hijacked Co'])->assertUnauthorized();
    }

    public function test_the_name_field_is_required(): void
    {
        $this->actingAsAdmin();

        $this->postJson('/api/company-profile', ['name' => ''])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    public function test_empty_optional_fields_are_accepted_and_cleared(): void
    {
        $this->actingAsAdmin();
        CompanyProfile::current()->update(['website' => 'https://old.example']);

        $this->postJson('/api/company-profile', [
            'name' => 'BHUIYAN INDUSTRY',
            'website' => '',
        ])->assertOk()->assertJsonPath('website', null);
    }
}
