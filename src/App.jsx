import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminHouses from './pages/admin/AdminHouses'
import AdminVehicles from './pages/admin/AdminVehicles'
import AdminFees from './pages/admin/AdminFees'
import AdminFeesBillingPenalty from './pages/admin/AdminFeesBillingPenalty'
import AdminFeesPrintInvoices from './pages/admin/AdminFeesPrintInvoices'
import AdminFeesPrintNotices from './pages/admin/AdminFeesPrintNotices'
import AdminRequests from './pages/admin/AdminRequests'
import AdminIssues from './pages/admin/AdminIssues'
import AdminViolations from './pages/admin/AdminViolations'
import AdminAnnouncements from './pages/admin/AdminAnnouncements'
import AdminReports from './pages/admin/AdminReports'
import AdminTechnicians from './pages/admin/AdminTechnicians'
import AdminMarketplace from './pages/admin/AdminMarketplace'
import AdminRules from './pages/admin/AdminRules'
import AdminConfig from './pages/admin/AdminConfig'
import AdminPaymentCycles from './pages/admin/AdminPaymentCycles'
import AdminUsers from './pages/admin/AdminUsers'
import AdminLogs from './pages/admin/AdminLogs'
import AdminLoginLogs from './pages/admin/AdminLoginLogs'
import AdminResidents from './pages/admin/AdminResidents'
import AdminUnits from './pages/admin/AdminUnits'
import AdminPayments from './pages/admin/AdminPayments'
import AdminMaintenance from './pages/admin/AdminMaintenance'
import AdminReportPayments from './pages/admin/AdminReportPayments'
import AdminReportOutstanding from './pages/admin/AdminReportOutstanding'
import AdminFeatureReceivePayment from './pages/admin/AdminFeatureReceivePayment'
import AdminFeatureExpensePayment from './pages/admin/AdminFeatureExpensePayment'
import AdminPaymentsSetup from './pages/admin/AdminPaymentsSetup'
import AdminBoardSets from './pages/admin/AdminBoardSets'
import AdminReportOverdue from './pages/admin/AdminReportOverdue'
import AdminReportViolationsSummary from './pages/admin/AdminReportViolationsSummary'
import AdminReportExpensePayments from './pages/admin/AdminReportExpensePayments'
import AdminFinanceV2 from './pages/admin/finance-v2/AdminFinanceV2'
import AdminFinanceV2Reports from './pages/admin/finance-v2/AdminFinanceV2Reports'
import ResidentLayout from './pages/resident/ResidentLayout'

const AdminWorkReports = lazy(() => import('./pages/admin/AdminWorkReportsList'))
const AdminWorkReportForm = lazy(() => import('./pages/admin/AdminWorkReportForm'))

// Guard: ถ้ายังไม่ login → ไป /login
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role !== 'admin') return <Navigate to="/resident/home" replace />
  return children
}

function RequireResident({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!profile) return <Navigate to="/login" replace />
  const canUseResidentPortal = profile.role === 'resident' || (profile.role === 'admin' && !!profile.house_id)
  if (!canUseResidentPortal) return <Navigate to="/admin/dashboard" replace />
  return children
}

// Guard: ถ้า login แล้ว → ไปหน้าที่ตรงกับ role อัตโนมัติ
function RoleRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!profile) return <Navigate to="/login" replace />
  return profile.role === 'admin'
    ? <Navigate to="/admin/dashboard" replace />
    : <Navigate to="/resident/home" replace />
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">กำลังโหลด...</span>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><RoleRedirect /></RequireAuth>} />

      {/* Admin routes */}
      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="houses" element={<AdminHouses />} />
        <Route path="vehicles" element={<AdminVehicles />} />
        <Route path="fees/billing-penalty" element={<AdminFeesBillingPenalty />} />
        <Route path="fees/print" element={<AdminFeesPrintInvoices />} />
        <Route path="fees/print-notice" element={<AdminFeesPrintNotices />} />
        <Route path="fees" element={<AdminFees />} />
        <Route path="requests" element={<AdminRequests />} />
        <Route path="issues" element={<AdminIssues />} />
        <Route path="violations" element={<AdminViolations />} />
        <Route path="rules" element={<AdminRules />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="reports/payments" element={<AdminReportPayments />} />
        <Route path="reports/outstanding" element={<AdminReportOutstanding />} />
        <Route path="receive-payments" element={<AdminFeatureReceivePayment />} />
        <Route path="disbursements" element={<AdminFeatureExpensePayment />} />
        <Route path="payments/setup" element={<AdminPaymentsSetup />} />
        <Route path="reports/overdue" element={<AdminReportOverdue />} />
        <Route path="reports/violations-summary" element={<AdminReportViolationsSummary />} />
        <Route path="reports/expense-payments" element={<AdminReportExpensePayments />} />
        <Route path="work-reports" element={<Suspense fallback={<PageLoader />}><AdminWorkReports /></Suspense>} />
        <Route path="work-reports/new" element={<Suspense fallback={<PageLoader />}><AdminWorkReportForm /></Suspense>} />
        <Route path="work-reports/:id/edit" element={<Suspense fallback={<PageLoader />}><AdminWorkReportForm /></Suspense>} />
        <Route path="technicians" element={<AdminTechnicians />} />
        <Route path="marketplace" element={<AdminMarketplace />} />
        <Route path="config" element={<AdminConfig />} />
        <Route path="config/payment-cycles" element={<AdminPaymentCycles />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="login-logs" element={<AdminLoginLogs />} />
        <Route path="residents" element={<AdminResidents />} />
        <Route path="units" element={<AdminUnits />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="maintenance" element={<AdminMaintenance />} />
        <Route path="board-sets" element={<AdminBoardSets />} />
        <Route path="finance-v2" element={<AdminFinanceV2 />} />
        <Route path="finance-v2/billing" element={<AdminFinanceV2 />} />
        <Route path="finance-v2/collections" element={<AdminFinanceV2 />} />
        <Route path="finance-v2/receive" element={<AdminFinanceV2 />} />
        <Route path="finance-v2/print-center" element={<AdminFinanceV2 />} />
        <Route path="finance-v2/archive" element={<AdminFinanceV2 />} />
        <Route path="finance-v2/reports" element={<AdminFinanceV2Reports />} />
        <Route path="finance-v2/reports/payments" element={<AdminReportPayments />} />
        <Route path="finance-v2/reports/outstanding" element={<AdminReportOutstanding />} />
        <Route path="finance-v2/reports/overdue" element={<AdminReportOverdue />} />
        <Route path="finance-v2/reports/violations-summary" element={<AdminReportViolationsSummary />} />
        <Route path="finance-v2/reports/expense-payments" element={<AdminReportExpensePayments />} />
      </Route>

      {/* Resident routes */}
      <Route path="/resident/*" element={
        <RequireAuth><RequireResident><ResidentLayout /></RequireResident></RequireAuth>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
