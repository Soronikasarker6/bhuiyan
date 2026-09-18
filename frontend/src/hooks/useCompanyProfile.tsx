import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CompanyProfile } from '@/types'
import { companyProfileService } from '@/services/api/companyProfileService'
import { onTokenChange } from '@/services/api/httpClient'

/**
 * Who the business is, everywhere that has to say so.
 *
 * One fetch, shared by every printed document (`PrintSheet`) and by
 * Settings → Company Profile, instead of each screen asking the API on its
 * own. `refresh()` is called right after a successful save, so a change to
 * the phone number or the logo reaches the *next* document printed without
 * needing a full page reload.
 *
 * The offline single-file build (`__OFFLINE__`) has no backend to ask, so it
 * never fetches — every document there prints the plain defaults below,
 * exactly as this app always has.
 */

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: 'BHUIYAN INDUSTRY',
  tagline: 'Agro-Based Limestone Manufacturing Company',
  ownerName: 'Aminul Islam Bhuiyan',
  designation: 'Founder & CEO',
  phone: '',
  email: '',
  address: '',
  website: '',
  logoUrl: null,
}

interface CompanyProfileValue {
  profile: CompanyProfile
  loading: boolean
  refresh: () => Promise<void>
}

const CompanyProfileContext = createContext<CompanyProfileValue | null>(null)

export function CompanyProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE)
  const [loading, setLoading] = useState(!__OFFLINE__)

  const refresh = useCallback(async () => {
    if (__OFFLINE__) return

    try {
      // The public endpoint, not the SETTINGS_VIEW-gated one — this is the
      // one shared read path every consumer uses (Settings' own display,
      // every printed document, and the public landing page's Contact
      // section), and none of it is confidential, so it's safe unauthenticated.
      setProfile(await companyProfileService.getPublic())
    } catch {
      // A letterhead falling back to the plain defaults is not worth a toast
      // on every failed background refetch — Settings surfaces real errors
      // when someone is actively editing the profile.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Re-fetch after login — a fresh session may belong to a different
    // deployment's profile than whatever loaded (or failed to) before it.
    return onTokenChange(() => refresh())
  }, [refresh])

  return (
    <CompanyProfileContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </CompanyProfileContext.Provider>
  )
}

export function useCompanyProfile(): CompanyProfileValue {
  const value = useContext(CompanyProfileContext)
  if (!value) throw new Error('useCompanyProfile must be used inside a CompanyProfileProvider')
  return value
}
