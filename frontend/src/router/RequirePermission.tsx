import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { usePermission } from '@/hooks/useAuth'

/**
 * Route-level "what the user can see" gate — separate from `RequireAuth`
 * (which only checks logged-in-or-not) so a page can additionally require a
 * specific permission. Safe in both builds: offline mode has no permission
 * concept and always passes (see `usePermission`).
 *
 * An array means "any of these" — used by /settings, which is reachable with
 * SETTINGS_VIEW *or* USERS_VIEW *or* ROLES_VIEW since it hosts tabs for all
 * three; each tab then hides itself individually if its own permission is
 * missing (see SettingsPage.tsx).
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string | string[]
  children: ReactNode
}) {
  const navigate = useNavigate()
  const required = Array.isArray(permission) ? permission : [permission]

  // Calling one hook per possible permission keeps the hook count fixed
  // across renders (the list itself is a static, build-time constant), which
  // is what the rules of hooks require.
  const results = required.map((name) => usePermission(name)) // eslint-disable-line react-hooks/rules-of-hooks
  const allowed = results.some(Boolean)

  useEffect(() => {
    if (!allowed) {
      toast.error("You don't have permission to view that page.")
      navigate('/', { replace: true })
    }
  }, [allowed, navigate])

  if (!allowed) return null

  return <>{children}</>
}
