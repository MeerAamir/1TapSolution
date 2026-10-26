import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { Spinner } from '@/components/ui/feedback'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Each area is its own chunk: someone scanning a QR never downloads the dashboard.
const HomePage = lazy(() => import('@/pages/marketing/HomePage'))
const LegalPage = lazy(() => import('@/pages/marketing/LegalPage'))
const PublicQrPage = lazy(() => import('@/pages/public/PublicQrPage'))
const PublicBusinessRoute = lazy(() => import('@/pages/public/PublicBusinessRoute'))
const AuthArea = lazy(() => import('@/pages/auth/AuthArea'))
const AdminArea = lazy(() => import('@/pages/admin/AdminArea'))

function Root() {
  return (
    <Suspense fallback={<Spinner />}>
      <Outlet />
    </Suspense>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/privacy', element: <LegalPage kind="privacy" /> },
      { path: '/terms', element: <LegalPage kind="terms" /> },
      { path: '/q/:code', element: <PublicQrPage /> },
      { path: '/b/:slug', element: <PublicBusinessRoute /> },
      { path: '/login', element: <AuthArea view="login" /> },
      { path: '/forgot-password', element: <AuthArea view="forgot" /> },
      { path: '/reset-password', element: <AuthArea view="reset" /> },
      { path: '/admin/*', element: <AdminArea /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
