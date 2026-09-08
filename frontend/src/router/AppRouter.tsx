import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageSkeleton } from '@/components/PageSkeleton'
import { PERMISSIONS } from '@/constants/permissions'
import { RequireAuth } from './RequireAuth'
import { RequirePermission } from './RequirePermission'

/**
 * Routes.
 *
 * Every page is lazy: an office clerk who only ever opens the ledger should
 * not download the charting library that the dashboard and reports need.
 *
 * `/login` plus a `RequireAuth` guard around everything else only exist in
 * the backend-connected build (`__OFFLINE__ === false`) — the offline
 * single-file build has no backend to sign in to, so it renders the exact
 * same route tree it always has. `RequirePermission` runs in both builds
 * (it's a no-op gate offline — see `usePermission`) so every route always
 * declares the permission it needs, once, in one place.
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

/** `<Lazy>` + `<RequirePermission>` around one page — the one pattern every route below uses. */
function Page({ permission, children }: { permission: string | string[]; children: React.ReactNode }) {
  return (
    <Lazy>
      <RequirePermission permission={permission}>{children}</RequirePermission>
    </Lazy>
  )
}

export function AppRouter() {
  const appRoutes = (
    <Route element={<AppLayout />}>
      <Route index element={<Page permission={PERMISSIONS.DASHBOARD_VIEW}><DashboardPage /></Page>} />
      <Route path="/import" element={<Page permission={PERMISSIONS.RAW_MATERIAL_VIEW}><ImportPage /></Page>} />
      <Route path="/production" element={<Page permission={PERMISSIONS.PRODUCTION_VIEW}><ProductionPage /></Page>} />
      <Route path="/sales" element={<Page permission={PERMISSIONS.SALES_VIEW}><SalesPage /></Page>} />
      <Route path="/customers" element={<Page permission={PERMISSIONS.CUSTOMERS_VIEW}><CustomersPage /></Page>} />
      <Route path="/customers/:id" element={<Page permission={PERMISSIONS.CUSTOMERS_VIEW}><CustomerDetailPage /></Page>} />
      <Route path="/customer-ledger" element={<Page permission={PERMISSIONS.CUSTOMER_LEDGER_VIEW}><CustomerLedgerPage /></Page>} />
      <Route path="/payments" element={<Page permission={PERMISSIONS.CASH_IN_VIEW}><PaymentsPage /></Page>} />
      <Route path="/products" element={<Page permission={PERMISSIONS.RAW_MATERIAL_VIEW}><ProductsPage /></Page>} />
      <Route path="/pnl" element={<Page permission={PERMISSIONS.PROFIT_VIEW}><ProfitPage /></Page>} />
      <Route path="/ledger" element={<Page permission={PERMISSIONS.LEDGER_VIEW}><LedgerPage /></Page>} />
      <Route path="/closing" element={<Page permission={PERMISSIONS.CLOSING_VIEW}><ClosingPage /></Page>} />
      <Route path="/reports" element={<Page permission={PERMISSIONS.REPORTS_VIEW}><ReportsPage /></Page>} />
      <Route
        path="/settings"
        element={
          <Page permission={[PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.USERS_VIEW, PERMISSIONS.ROLES_VIEW]}>
            <SettingsPage />
          </Page>
        }
      />
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
