/**
 * Who the business is, for anything that carries its identity outward.
 *
 * This is the one shape both `useCompanyProfile()` (the live, backend-backed
 * copy) and every printed document read — no PDF, invoice or report carries
 * its own copy of the company name, owner or contact details. See
 * `hooks/useCompanyProfile.tsx` for the default used before the real record
 * has loaded (or in the offline build, which has no backend to load it from).
 */
export interface CompanyProfile {
  id?: string
  name: string
  tagline: string
  ownerName: string
  designation: string
  phone: string
  email: string
  address: string
  website: string
  logoUrl: string | null
}
