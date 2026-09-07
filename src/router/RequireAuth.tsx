import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useAuth } from '@/hooks/useAuth'

/**
 * Guards every route except `/login` in the backend-connected build. Only
 * ever rendered when `__OFFLINE__` is false — see `src/router/AppRouter.tsx`.
 */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageSkeleton />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
