import { useEffect, useRef, useState } from 'react'
import { Building2, ImageOff, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useCompanyProfile } from '@/hooks/useCompanyProfile'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { companyProfileService } from '@/services/api/companyProfileService'
import { ApiError } from '@/services/api/httpClient'
import type { CompanyProfile } from '@/types'

type FormState = Omit<CompanyProfile, 'id' | 'logoUrl'>

function toFormState(profile: CompanyProfile): FormState {
  return {
    name: profile.name,
    tagline: profile.tagline,
    ownerName: profile.ownerName,
    designation: profile.designation,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
    website: profile.website,
  }
}

/**
 * Settings → Company Profile — the single source of truth for the business's
 * own identity, contact details and logo. Everything on this screen is what
 * every printed document (`PrintSheet`) reads instead of carrying its own
 * hardcoded copy; saving here reaches the next document printed without a
 * page reload, via `useCompanyProfile()`'s shared `refresh()`.
 *
 * View and edit are split exactly the way every other Settings panel splits
 * them: `SETTINGS_VIEW` gets you the read-only screen, `SETTINGS_EDIT` is
 * what un-disables the form. A user with neither never reaches this panel at
 * all — see the tab guard in `SettingsPage.tsx`.
 */
export function CompanyProfilePanel() {
  const { profile, loading, refresh } = useCompanyProfile()
  const canEdit = usePermission(PERMISSIONS.SETTINGS_EDIT)

  const [form, setForm] = useState<FormState>(toFormState(profile))
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState<string | undefined>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The live profile can change under this screen (another tab saving, the
  // shared refresh() after this screen's own save) — resync whenever it does,
  // but never while a logo the user just picked is still only staged locally.
  useEffect(() => {
    if (!logoFile) setForm(toFormState(profile))
  }, [profile, logoFile])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const pickLogo = (file: File | null) => {
    setLogoFile(file)
    setRemoveLogo(false)
    setLogoPreview(file ? URL.createObjectURL(file) : null)
  }

  const clearLogo = () => {
    pickLogo(null)
    setRemoveLogo(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const displayedLogo = logoPreview ?? (removeLogo ? null : profile.logoUrl)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    const trimmedName = form.name.trim()
    if (!trimmedName) {
      setNameError('Company name is required')
      return
    }
    setNameError(undefined)

    setSaving(true)
    try {
      await companyProfileService.update({
        ...form,
        name: trimmedName,
        logo: logoFile ?? undefined,
        removeLogo,
      })
      await refresh()
      setLogoFile(null)
      setLogoPreview(null)
      setRemoveLogo(false)
      toast.success('Company profile saved', {
        description: 'Future printed documents will use these details.',
      })
    } catch (error) {
      toast.error('Could not save the company profile', {
        description: error instanceof ApiError ? error.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <form onSubmit={submit} className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          You can view the company profile, but only an Admin can change it.
        </p>
      )}

      <Section
        title="Company information"
        description="Heads every invoice, register and report the system prints."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name" htmlFor="cp-name" error={nameError}>
            <Input
              id="cp-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={!canEdit}
              required
            />
          </Field>

          <Field label="Founder / CEO" htmlFor="cp-owner">
            <Input
              id="cp-owner"
              value={form.ownerName}
              onChange={(e) => set('ownerName', e.target.value)}
              disabled={!canEdit}
            />
          </Field>

          <Field label="Business description" htmlFor="cp-tagline" hint="What the business does — shown under its name on every document.">
            <Input
              id="cp-tagline"
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
              disabled={!canEdit}
            />
          </Field>

          <Field label="Designation" htmlFor="cp-designation">
            <Input
              id="cp-designation"
              value={form.designation}
              onChange={(e) => set('designation', e.target.value)}
              disabled={!canEdit}
              placeholder="Founder & CEO"
            />
          </Field>
        </div>
      </Section>

      <Section title="Contact information" description="Shown on every document — a blank field is simply left off.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" htmlFor="cp-phone">
            <Input
              id="cp-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              disabled={!canEdit}
              placeholder="+880 ........"
            />
          </Field>

          <Field label="Email" htmlFor="cp-email">
            <Input
              id="cp-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={!canEdit}
              placeholder="office@company.com"
            />
          </Field>

          <Field label="Location / Address" htmlFor="cp-address">
            <Textarea
              id="cp-address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={!canEdit}
              rows={2}
            />
          </Field>

          <Field label="Website" htmlFor="cp-website" hint="Optional">
            <Input
              id="cp-website"
              type="url"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              disabled={!canEdit}
              placeholder="https://…"
            />
          </Field>
        </div>
      </Section>

      <Section title="Company logo" description="Shown at the top of every printed document, where set.">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-secondary/40">
            {displayedLogo ? (
              <img src={displayedLogo} alt="Company logo" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden />
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload />
                {profile.logoUrl || logoPreview ? 'Change logo' : 'Upload logo'}
              </Button>
              {displayedLogo && (
                <Button type="button" variant="ghost" size="sm" onClick={clearLogo}>
                  <ImageOff />
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </Section>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  )
}
