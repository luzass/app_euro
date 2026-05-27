import type { PropsWithChildren } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedLayout } from '../components/Layout/ProtectedLayout'
import { Loading } from '../components/UI/Loading'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { getDefaultRoute } from '../lib/navigation'
import type { Role } from '../lib/types'
import { CriarUsuario } from '../pages/CriarUsuario'
import { DashboardEuro } from '../pages/DashboardEuro'
import { Login } from '../pages/Login'
import { NotFound } from '../pages/NotFound'
import { TrafegoPagoSpike } from '../pages/TrafegoPagoSpike'

function RootRedirect() {
  const { user, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useProfile()

  if (authLoading || (user && profileLoading)) {
    return <Loading fullScreen message="Preparando sua navegação..." />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={profile ? getDefaultRoute(profile.role) : '/app'} replace />
}

function RoleHomeRedirect() {
  const { profile, loading } = useProfile()

  if (loading) {
    return <Loading message="Definindo página inicial..." />
  }

  return <Navigate to={getDefaultRoute(profile?.role)} replace />
}

function RequireRole({
  allowedRoles,
  children,
}: PropsWithChildren<{ allowedRoles: Role[] }>) {
  const { profile, loading } = useProfile()

  if (loading) {
    return <Loading message="Validando permissões..." />
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return <Navigate to={getDefaultRoute(profile?.role)} replace />
  }

  return <>{children}</>
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route path="/app" element={<ProtectedLayout />}>
          <Route index element={<RoleHomeRedirect />} />
          <Route
            path="spike"
            element={
              <RequireRole allowedRoles={['admin', 'reitoria', 'spike']}>
                <TrafegoPagoSpike />
              </RequireRole>
            }
          />
          <Route
            path="dashboard-euro"
            element={
              <RequireRole allowedRoles={['admin', 'reitoria', 'captacao', 'funcionario']}>
                <DashboardEuro />
              </RequireRole>
            }
          />
          <Route
            path="criar-usuario"
            element={
              <RequireRole allowedRoles={['admin']}>
                <CriarUsuario />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
