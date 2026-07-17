export type Role =
  | 'admin'
  | 'reitoria'
  | 'spike'
  | 'captacao'
  | 'captacao_gerente'
  | 'funcionario'

export interface Profile {
  id: string
  nome: string
  email: string
  role: Role
  created_at: string
}

export function formatRoleLabel(role?: Role | null) {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'reitoria':
      return 'Reitoria'
    case 'spike':
      return 'Spike'
    case 'captacao':
      return 'Captação'
    case 'captacao_gerente':
      return 'Gerente de Captação'
    case 'funcionario':
      return 'Captação'
    default:
      return 'Sem perfil'
  }
}
