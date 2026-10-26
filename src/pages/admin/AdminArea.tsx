import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAdmin } from '@/auth/RequireAdmin'
import { Spinner } from '@/components/ui/feedback'
import { Toaster } from '@/components/ui/toaster'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AdminLayout } from './AdminLayout'

const OverviewPage = lazy(() => import('./overview/OverviewPage'))
const BusinessesPage = lazy(() => import('./businesses/BusinessesPage'))
const BusinessFormPage = lazy(() => import('./businesses/BusinessFormPage'))
const BusinessDetailPage = lazy(() => import('./businesses/BusinessDetailPage'))
const QrListPage = lazy(() => import('./qr/QrListPage'))
const QrEditorPage = lazy(() => import('./qr/QrEditorPage'))
const CategoriesPage = lazy(() => import('./categories/CategoriesPage'))
const FilesPage = lazy(() => import('./files/FilesPage'))
const AnalyticsPage = lazy(() => import('./analytics/AnalyticsPage'))
const MessagesPage = lazy(() => import('./messages/MessagesPage'))
const SettingsPage = lazy(() => import('./settings/SettingsPage'))

export default function AdminArea() {
  return (
    <AuthProvider>
      <RequireAdmin>
        <AdminLayout>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route index element={<OverviewPage />} />
              <Route path="businesses" element={<BusinessesPage />} />
              <Route path="businesses/new" element={<BusinessFormPage />} />
              <Route path="businesses/:id" element={<BusinessDetailPage />} />
              <Route path="businesses/:id/edit" element={<BusinessFormPage />} />
              <Route path="qr" element={<QrListPage />} />
              <Route path="qr/new" element={<QrEditorPage />} />
              <Route path="qr/:id" element={<QrEditorPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="files" element={<FilesPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AdminLayout>
      </RequireAdmin>
      <Toaster />
    </AuthProvider>
  )
}
