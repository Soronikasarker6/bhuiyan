<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CompanyProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Settings → Company Profile. One row, `CompanyProfile::current()` — see
 * that model for why. `update` is POST, not PUT: the logo is uploaded as
 * `multipart/form-data`, which PHP does not parse for PUT requests, and a
 * spoofed `_method` field is more surprising for API consumers than a plain
 * POST on a singleton resource that has nothing else to be posted to.
 */
class CompanyProfileController extends Controller
{
    public function show()
    {
        return CompanyProfile::current();
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'tagline' => ['nullable', 'string', 'max:200'],
            'owner_name' => ['nullable', 'string', 'max:150'],
            'designation' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'website' => ['nullable', 'string', 'max:150'],
            'logo' => ['nullable', 'image', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
        ]);

        $profile = CompanyProfile::current();

        if ($request->hasFile('logo')) {
            if ($profile->logo_path) {
                Storage::disk('public')->delete($profile->logo_path);
            }
            $data['logo_path'] = $request->file('logo')->store('company', 'public');
        } elseif ($request->boolean('remove_logo') && $profile->logo_path) {
            Storage::disk('public')->delete($profile->logo_path);
            $data['logo_path'] = null;
        }

        unset($data['logo'], $data['remove_logo']);

        $profile->update($data);

        return $profile->fresh();
    }
}
