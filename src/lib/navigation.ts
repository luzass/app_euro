import {
  BarChart3,
  type LucideIcon,
  History,
  LayoutDashboard,
  Target,
  UserRoundPlus,
} from 'lucide-react'
import type { Profile, Role } from './types'

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
    allowedRoles: ['admin', 'reitoria', 'spike', 'captacao_gerente'],
  },
  {
    title: 'Dashboard - Funil',
    path: '/app/dashboard-funil',
    icon: LayoutDashboard,
    allowedRoles: [
      'admin',
      'reitoria',
      'coordenador',
      'spike',
      'captacao',
      'captacao_gerente',
      'funcionario',
    ],
  },
  {
    title: 'Dashboard - Histórico',
    path: '/app/dashboard-historico',
    icon: History,
    allowedRoles: [
      'admin',
      'reitoria',
      'coordenador',
      'spike',
      'captacao',
      'captacao_gerente',
      'funcionario',
    ],
  },
  {
    title: 'Painel de Captação',
    path: '/app/painel-captacao',
    icon: Target,
    allowedRoles: ['admin', 'reitoria', 'captacao', 'captacao_gerente', 'funcionario'],
  },
  {
    title: 'Adicionar colaboradores',
    path: '/app/criar-usuario',
    icon: UserRoundPlus,
    allowedRoles: ['admin'],
  },
]

export function getDefaultRoute(role?: Role | null) {
  if (role === 'spike') {
    return '/app/spike'
  }

  if (role === 'captacao' || role === 'captacao_gerente' || role === 'funcionario') {
    return '/app/painel-captacao'
  }

  return '/app/dashboard-funil'
}

export function getDefaultRouteForProfile(profile?: Profile | null) {
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
