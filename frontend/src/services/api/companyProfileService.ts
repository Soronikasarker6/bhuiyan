import type { CompanyProfile } from '@/types'
import { http } from './httpClient'
import { mapEntity } from './mappers'

export interface CompanyProfileInput {
  name: string
  tagline: string
  ownerName: string
  designation: string
  phone: string
  email: string
  address: string
  website: string
  /** A newly chosen file — omitted when the logo isn't changing. */
  logo?: File
  /** Set to clear a previously uploaded logo without replacing it. */
  removeLogo?: boolean
}

/**
 * Every text field is nullable in the database (an unset phone number is
 * simply absent, not an empty string) — so the API can legitimately answer
 * with JSON `null`. Coerced to `''` here, once, so nothing downstream (an
 * `<input value>`, a trimmed save) ever has to handle `string | null`.
 */
function normalize(profile: CompanyProfile): CompanyProfile {
  return {
    ...profile,
    tagline: profile.tagline ?? '',
    ownerName: profile.ownerName ?? '',
    designation: profile.designation ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    address: profile.address ?? '',
    website: profile.website ?? '',
  }
}

/** POST, not PUT — the logo travels as `multipart/form-data`, which PHP never parses on a PUT request. */
export const companyProfileService = {
  async get(): Promise<CompanyProfile> {
    return normalize(mapEntity<CompanyProfile>(await http.get('/company-profile')))
  },
  /** No auth required — the public landing page's Contact section reads this. */
  async getPublic(): Promise<CompanyProfile> {
    return normalize(mapEntity<CompanyProfile>(await http.get('/public/company-profile')))
  },
  async update(input: CompanyProfileInput): Promise<CompanyProfile> {
    const form = new FormData()
    form.set('name', input.name)
    form.set('tagline', input.tagline)
    form.set('owner_name', input.ownerName)
    form.set('designation', input.designation)
    form.set('phone', input.phone)
    form.set('email', input.email)
    form.set('address', input.address)
    form.set('website', input.website)
    if (input.logo) form.set('logo', input.logo)
    if (input.removeLogo) form.set('remove_logo', '1')

    return normalize(mapEntity<CompanyProfile>(await http.post('/company-profile', form)))
  },
}
