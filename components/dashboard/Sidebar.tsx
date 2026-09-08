'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { navigationFor } from '@/lib/modules'
import { ICONS } from './nav-icons'
import { BrandLockup } from '@/components/ui/BrandMark'

interface SidebarProps {
  role: string
  userName: string
  userEmail: string
  /** Drawer aberto em telas < lg. Ignorado no desktop. */
  open: boolean
  onNavigate: () => void
}

export default function Sidebar({ role, userName, userEmail, open, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className={cn(
        'w-[15rem] bg-surface border-r border-line flex flex-col flex-none',
        // Desktop: coluna fixa. Abaixo de lg: drawer sobreposto.
        'fixed inset-y-0 left-0 z-50 transition-transform duration-[380ms] ease-bp',
        'lg:static lg:translate-x-0 lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="h-16 px-5 flex items-center border-b border-line flex-none">
        <BrandLockup />
      </div>

      <nav className="flex-1 overflow-y-auto py-5">
        {navigationFor(role).map((section) => (
          <div key={section.key} className="mb-6 last:mb-2">
            <p className="t-label text-subtle/70 px-5 mb-2">{section.label}</p>
            <div className="px-2.5 space-y-px">
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.route
                  : pathname === item.route || pathname.startsWith(item.route + '/')
                return (
                  <Link
                    key={item.key}
                    href={item.route}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 pl-3.5 pr-3 py-2 rounded-lg text-[0.875rem]',
                      'transition-colors duration-[180ms] ease-bp',
                      isActive
                        ? 'text-fg font-medium bg-[var(--bp-accent-wash)]'
                        : 'text-muted hover:text-fg hover:bg-white/[0.04]'
                    )}
                  >
                    {/* Barra de 2px marca o item ativo — o mesmo recurso do site. */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full transition-colors duration-[180ms]',
                        isActive ? 'bg-accent' : 'bg-transparent'
                      )}
                    />
                    <span className={cn('flex-none', isActive ? 'text-accent-soft' : 'text-subtle')}>
                      {ICONS[item.key]}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2.5 flex-none">
        <div className="flex items-center gap-2.5 px-2 py-2">
          {/* Sem gradiente: iniciais sobre superfície, com fio. */}
          <span className="w-7 h-7 rounded-lg bg-surface-2 border border-line flex items-center justify-center flex-none">
            <span className="text-[0.6875rem] font-semibold text-fg">{userName.charAt(0).toUpperCase()}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block t-sm font-medium text-fg truncate leading-none">{userName}</span>
            <span className="block text-[0.6875rem] text-subtle truncate mt-1">{userEmail}</span>
          </span>
        </div>

        <Link
          href="/dashboard/perfil"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg t-sm text-muted hover:text-fg hover:bg-white/[0.04] transition-colors duration-[180ms]"
        >
          <svg className="w-3.5 h-3.5 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Meu Perfil
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg t-sm text-muted hover:text-fg hover:bg-white/[0.04] transition-colors duration-[180ms]"
        >
          <svg className="w-3.5 h-3.5 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </button>

        <p className="px-2 pt-3 pb-1 t-mono text-subtle/60">BASS PAGO REVOPS · v0.1.0</p>
      </div>
    </aside>
  )
}
