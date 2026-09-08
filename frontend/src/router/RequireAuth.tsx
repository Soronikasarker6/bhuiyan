import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useAuth } from '@/hooks/useAuth'

/**
 * Guards every route except `/login` in the backend-connected build. Only
 * ever rendered when `__OFFLINE__` is false — see `src/router/AppRouter.tsx`.
 *
 * An optional `permission` gates the whole route on top of plain
 * logged-in-or-not: missing it redirects to `/` with an explanatory toast,
 * the route-level equivalent of V12's Angular `canActivateRoute(permission)`
 * guard factory.
 */
export function RequireAuth({ permission }: { permission?: string }) {
  const { user, loading, isPermissionValid } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const denied = Boolean(user) && Boolean(permission) && !isPermissionValid(permission!)

  useEffect(() => {
    if (denied) {
      toast.error("You don't have permission to view that page.")
      navigate('/', { replace: true })
    }
  }, [denied, navigate])

  if (loading) return <PageSkeleton />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (denied) return null

  return <Outlet />
}
