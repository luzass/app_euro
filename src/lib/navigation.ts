import {
  BarChart3,
  type LucideIcon,
  LayoutDashboard,
  UserRoundPlus,
} from 'lucide-react'
import type { Role } from './types'

export interface NavItem {
  title: string
  path: string
  icon: LucideIcon
  allowedRoles: Role[]
}

export const navItems: NavItem[] = [
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
