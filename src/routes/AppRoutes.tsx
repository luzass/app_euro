import type { PropsWithChildren } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedLayout } from '../components/Layout/ProtectedLayout'
import { Loading } from '../components/UI/Loading'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { getDefaultRouteForProfile } from '../lib/navigation'
import type { Role } from '../lib/types'
import { CriarUsuario } from '../pages/CriarUsuario'
import { DashboardEuro } from '../pages/DashboardEuro'
import { Login } from '../pages/Login'
import { Metas } from '../pages/Metas'
import { NotFound } from '../pages/NotFound'
import { PainelVendedor } from '../pages/PainelVendedor'
import { TrafegoPagoSpike } from '../pages/TrafegoPagoSpike'
import { VisaoCrm } from '../pages/VisaoCrm'

function RootRedirect() {
  const { user, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useProfile()

  if (authLoading || (user && profileLoading)) {
    return <Loading fullScreen message="Preparando sua navegação..." />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={profile ? getDefaultRouteForProfile(profile) : '/app'} replace />
}

function RoleHomeRedirect() {
  const { profile, loading } = useProfile()

  if (loading) {
    return <Loading message="Definindo página inicial..." />
  }

  return <Navigate to={getDefaultRouteForProfile(profile)} replace />
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
    return <Navigate to={getDefaultRouteForProfile(profile)} replace />
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
            path="painel-vendedor"
            element={
              <RequireRole
                allowedRoles={['admin', 'reitoria', 'captacao', 'captacao_gerente', 'funcionario']}
              >
                <PainelVendedor />
              </RequireRole>
            }
          />
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
              <RequireRole
                allowedRoles={['admin', 'reitoria', 'captacao', 'captacao_gerente', 'funcionario']}
              >
                <DashboardEuro />
              </RequireRole>
            }
          />
          <Route
            path="metas"
            element={
              <RequireRole allowedRoles={['admin', 'reitoria', 'captacao_gerente']}>
                <Metas />
              </RequireRole>
            }
          />
          <Route
            path="visao-crm"
            element={
              <RequireRole allowedRoles={['admin', 'reitoria', 'captacao_gerente']}>
                <VisaoCrm />
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
