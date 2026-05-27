import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getAllowedNavItems } from '../../lib/navigation'
import { formatRoleLabel } from '../../lib/types'
import { cn } from '../../lib/utils'
import { useProfile } from '../../hooks/useProfile'
import { useAuth } from '../../hooks/useAuth'

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
  desktopCollapsed: boolean
  onToggleDesktopCollapse: () => void
}

export function Sidebar({
  mobileOpen,
  onClose,
  desktopCollapsed,
  onToggleDesktopCollapse,
}: SidebarProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { profile } = useProfile()
  const menuItems = getAllowedNavItems(profile?.role)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = (profile?.nome ?? 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-slate-950/45 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-[#004181] text-white shadow-xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          desktopCollapsed ? 'w-[88px]' : 'w-[292px]',
        )}
      >
        <div className="absolute inset-y-0 right-0 hidden w-[6px] bg-[#BA9008] lg:block" />

        <div
          className={cn(
            'flex items-center border-b border-white/10 px-5 py-5',
            desktopCollapsed ? 'justify-center lg:px-3' : 'justify-between',
          )}
        >
          {desktopCollapsed ? null : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                Dashboard-Unieuro
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleDesktopCollapse}
              className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white transition hover:bg-white/14 lg:inline-flex"
              aria-label={desktopCollapsed ? 'Expandir menu' : 'Recolher menu'}
              title={desktopCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {desktopCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white lg:hidden"
              aria-label="Fechar menu"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className={cn('flex-1 space-y-2 py-5', desktopCollapsed ? 'px-3' : 'px-4')}>
          {menuItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                title={desktopCollapsed ? item.title : undefined}
                className={({ isActive }: { isActive: boolean }) =>
                  cn(
                    'flex items-center rounded-2xl text-sm font-medium transition-colors',
                    desktopCollapsed ? 'justify-center px-3 py-3.5' : 'gap-3 px-4 py-3.5',
                    isActive
                      ? 'bg-[#02162d] text-white shadow-[0_18px_30px_rgba(2,22,45,0.35)]'
                      : 'text-white/82 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {desktopCollapsed ? null : <span>{item.title}</span>}
              </NavLink>
            )
          })}
        </nav>

        <div
          className={cn(
            'border-t border-white/10 bg-[#02162d] py-5',
            desktopCollapsed ? 'px-3' : 'px-4',
          )}
        >
          <div
            className={cn(
              'rounded-3xl border border-white bg-[#02162d] shadow-[0_20px_40px_rgba(2,22,45,0.35)]',
              desktopCollapsed ? 'px-3 py-4' : 'p-4',
            )}
          >
            {desktopCollapsed ? (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white"
                  title={profile?.nome ?? 'Usuário'}
                >
                  {initials}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#BA9008] text-[#02162d] transition hover:bg-[#c89b10]"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-white">{profile?.nome ?? 'Usuário'}</p>
                <p className="mt-1 break-all text-sm text-white/68">{profile?.email ?? '--'}</p>
                <p className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                  {formatRoleLabel(profile?.role)}
                </p>

                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#BA9008] px-4 py-3 text-sm font-semibold text-[#02162d] transition hover:bg-[#c89b10]"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
