import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageSkeleton } from '@/components/PageSkeleton'
import { RequireAuth } from './RequireAuth'

/**
 * Routes.
 *
 * Every page is lazy: an office clerk who only ever opens the ledger should
 * not download the charting library that the dashboard and reports need.
 *
 * `/login` plus a `RequireAuth` guard around everything else only exist in
 * the backend-connected build (`__OFFLINE__ === false`) — the offline
 * single-file build has no backend to sign in to, so it renders the exact
 * same route tree it always has.
 */
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ImportPage = lazy(() => import('@/pages/ImportPage'))
const ProductionPage = lazy(() => import('@/pages/ProductionPage'))
const SalesPage = lazy(() => import('@/pages/SalesPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage'))
const CustomerLedgerPage = lazy(() => import('@/pages/CustomerLedgerPage'))
const PaymentsPage = lazy(() => import('@/pages/PaymentsPage'))
const ProductsPage = lazy(() => import('@/pages/ProductsPage'))
const ProfitPage = lazy(() => import('@/pages/ProfitPage'))
const LedgerPage = lazy(() => import('@/pages/LedgerPage'))
const ClosingPage = lazy(() => import('@/pages/ClosingPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

export function AppRouter() {
  const appRoutes = (
    <Route element={<AppLayout />}>
      <Route index element={<Lazy><DashboardPage /></Lazy>} />
      <Route path="/import" element={<Lazy><ImportPage /></Lazy>} />
      <Route path="/production" element={<Lazy><ProductionPage /></Lazy>} />
      <Route path="/sales" element={<Lazy><SalesPage /></Lazy>} />
      <Route path="/customers" element={<Lazy><CustomersPage /></Lazy>} />
      <Route path="/customers/:id" element={<Lazy><CustomerDetailPage /></Lazy>} />
      <Route path="/customer-ledger" element={<Lazy><CustomerLedgerPage /></Lazy>} />
      <Route path="/payments" element={<Lazy><PaymentsPage /></Lazy>} />
      <Route path="/products" element={<Lazy><ProductsPage /></Lazy>} />
      <Route path="/pnl" element={<Lazy><ProfitPage /></Lazy>} />
      <Route path="/ledger" element={<Lazy><LedgerPage /></Lazy>} />
      <Route path="/closing" element={<Lazy><ClosingPage /></Lazy>} />
      <Route path="/reports" element={<Lazy><ReportsPage /></Lazy>} />
      <Route path="/settings" element={<Lazy><SettingsPage /></Lazy>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  )

  if (__OFFLINE__) {
    return <Routes>{appRoutes}</Routes>
  }

  return (
    <Routes>
      <Route path="/login" element={<Lazy><LoginPage /></Lazy>} />
      <Route element={<RequireAuth />}>{appRoutes}</Route>
    </Routes>
  )
}
