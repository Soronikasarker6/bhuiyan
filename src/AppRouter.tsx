import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageSkeleton } from '@/components/PageSkeleton'

/**
 * Routes.
 *
 * Every page is lazy: an office clerk who only ever opens the ledger should
 * not download the charting library that the dashboard and reports need.
 */
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ProductionPage = lazy(() => import('@/pages/ProductionPage'))
const SalesPage = lazy(() => import('@/pages/SalesPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@/pages/CustomerDetailPage'))
const CustomerLedgerPage = lazy(() => import('@/pages/CustomerLedgerPage'))
const AdvancesPage = lazy(() => import('@/pages/AdvancesPage'))
const PaymentsPage = lazy(() => import('@/pages/PaymentsPage'))
const ProductsPage = lazy(() => import('@/pages/ProductsPage'))
const PnlPage = lazy(() => import('@/pages/PnlPage'))
const LedgerPage = lazy(() => import('@/pages/LedgerPage'))
const ClosingPage = lazy(() => import('@/pages/ClosingPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Lazy><DashboardPage /></Lazy>} />
        <Route path="/production" element={<Lazy><ProductionPage /></Lazy>} />
        <Route path="/sales" element={<Lazy><SalesPage /></Lazy>} />
        <Route path="/customers" element={<Lazy><CustomersPage /></Lazy>} />
        <Route path="/customers/:id" element={<Lazy><CustomerDetailPage /></Lazy>} />
        <Route path="/customer-ledger" element={<Lazy><CustomerLedgerPage /></Lazy>} />
        <Route path="/advances" element={<Lazy><AdvancesPage /></Lazy>} />
        <Route path="/payments" element={<Lazy><PaymentsPage /></Lazy>} />
        <Route path="/products" element={<Lazy><ProductsPage /></Lazy>} />
        <Route path="/pnl" element={<Lazy><PnlPage /></Lazy>} />
        <Route path="/ledger" element={<Lazy><LedgerPage /></Lazy>} />
        <Route path="/closing" element={<Lazy><ClosingPage /></Lazy>} />
        <Route path="/reports" element={<Lazy><ReportsPage /></Lazy>} />
        <Route path="/settings" element={<Lazy><SettingsPage /></Lazy>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
