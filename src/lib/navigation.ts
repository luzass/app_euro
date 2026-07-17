import {
  BarChart3,
  type LucideIcon,
  Building2,
  LayoutDashboard,
  MonitorCog,
  Target,
  UserRoundPlus,
} from 'lucide-react'
import { resolveSellerFromProfile } from './sellers'
import type { Profile, Role } from './types'

export interface NavItem {
  title: string
  path: string
  icon: LucideIcon
  allowedRoles: Role[]
}

export const navItems: NavItem[] = [
  {
    title: 'Meu painel',
    path: '/app/painel-vendedor',
    icon: MonitorCog,
    allowedRoles: ['admin', 'reitoria', 'captacao', 'funcionario'],
  },
  {
    title: 'Tráfego Pago - Spike',
    path: '/app/spike',
    icon: BarChart3,
    allowedRoles: ['admin', 'reitoria', 'spike'],
  },
  {
    title: 'Dashboard - Euro',
    path: '/app/dashboard-euro',
    icon: LayoutDashboard,
    allowedRoles: ['admin', 'reitoria', 'captacao', 'funcionario'],
  },
  {
    title: 'Metas',
    path: '/app/metas',
    icon: Target,
    allowedRoles: ['admin', 'reitoria', 'captacao'],
  },
  {
    title: 'Visão CRM',
    path: '/app/visao-crm',
    icon: Building2,
    allowedRoles: ['admin', 'reitoria', 'captacao'],
  },
  {
    title: 'Criar Usuário',
    path: '/app/criar-usuario',
    icon: UserRoundPlus,
    allowedRoles: ['admin'],
  },
]

export function getDefaultRoute(role?: Role | null) {
  if (role === 'spike') {
    return '/app/spike'
  }

  if (role === 'captacao' || role === 'funcionario' || role === 'reitoria') {
    return '/app/dashboard-euro'
  }

  return '/app/spike'
}

export function getDefaultRouteForProfile(profile?: Profile | null) {
  const seller = resolveSellerFromProfile(profile)

  if (seller && (profile?.role === 'captacao' || profile?.role === 'funcionario')) {
    return '/app/painel-vendedor'
  }

  return getDefaultRoute(profile?.role)
}

export function getAllowedNavItems(role?: Role | null) {
  if (!role) {
    return []
  }

  return navItems.filter((item) => item.allowedRoles.includes(role))
}

export function canAccessPath(pathname: string, role?: Role | null) {
  if (!role) {
    return false
  }

  const matchingRoute = navItems.find((item) => pathname.startsWith(item.path))
  return matchingRoute ? matchingRoute.allowedRoles.includes(role) : true
}

export function getPageTitle(pathname: string) {
  const matchingRoute = navItems.find((item) => pathname.startsWith(item.path))
  return matchingRoute?.title ?? 'Dashboard'
}
