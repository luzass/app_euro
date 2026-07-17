import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { Loading } from '../UI/Loading'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import { canAccessPath, getDefaultRouteForProfile, getPageTitle } from '../../lib/navigation'

export function ProtectedLayout() {
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading, error } = useProfile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const storedValue = window.localStorage.getItem('sidebar-collapsed')
    setDesktopCollapsed(storedValue === 'true')
  }, [])

  const handleToggleDesktopSidebar = () => {
    setDesktopCollapsed((currentValue) => {
      const nextValue = !currentValue
      window.localStorage.setItem('sidebar-collapsed', String(nextValue))
      return nextValue
    })
  }

  if (authLoading || (user && profileLoading)) {
    return <Loading fullScreen message="Preparando seu dashboard..." />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (profile && !canAccessPath(location.pathname, profile.role)) {
    return <Navigate to={getDefaultRouteForProfile(profile)} replace />
  }

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 lg:grid"
      style={{
        gridTemplateColumns: desktopCollapsed ? '88px minmax(0, 1fr)' : '292px minmax(0, 1fr)',
      }}
    >
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        desktopCollapsed={desktopCollapsed}
        onToggleDesktopCollapse={handleToggleDesktopSidebar}
      />

      <div className="min-w-0">
        <Header title={getPageTitle(location.pathname)} onOpenSidebar={() => setMobileOpen(true)} />

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {error ? (
            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
              {error}
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
