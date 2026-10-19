import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import './App.css'
import { RouteGroupErrorBoundary } from './routes/RouteGroupErrorBoundary'
import RouteLoadingState from './routes/RouteLoadingState'

const PublicRoutes = lazy(() => import('./routes/PublicRoutes'))
const ProducerRoutes = lazy(() => import('./routes/ProducerRoutes'))
const AdminRoutes = lazy(() => import('./routes/AdminRoutes'))

export default function App() {
  const { pathname } = useLocation()
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')
  const isProducer = ['/mi-panel', '/mi-perfil', '/verificar', '/mis-productos'].includes(pathname)
    || pathname.startsWith('/mis-productos/')
  const Group = isAdmin ? AdminRoutes : isProducer ? ProducerRoutes : PublicRoutes

  return (
    <RouteGroupErrorBoundary>
      <Suspense fallback={<RouteLoadingState />}>
        <Group />
      </Suspense>
    </RouteGroupErrorBoundary>
  )
}
