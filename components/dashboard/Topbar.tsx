'use client'

import { usePathname } from 'next/navigation'
import { activeFeatures } from '@/lib/modules'
import { Dot } from '@/components/ui/Badge'
import SinoNotificacoes from '@/components/notificacoes/SinoNotificacoes'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/theme/ThemeToggle'
import RelogiosGlobais from './RelogiosGlobais'

/**
 * Barra superior: marca à esquerda, localização (módulo › função) e os
 * horários das quatro praças à direita.
 *
 * A marca é a LOGO OFICIAL da Bass Pago, e só ela — o lockup anterior, com o
 * símbolo desenhado em SVG e a palavra "RevOps" ao lado, saiu do produto.
 */
export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname()

  const current = activeFeatures()
    .filter((f) => (f.exact ? pathname === f.route : pathname === f.route || pathname.startsWith(f.route + '/')))
    .sort((a, b) => b.route.length - a.route.length)[0]

  return (
    <header className="h-16 flex-none sticky top-0 z-30 bg-ink/85 backdrop-blur-md border-b border-line">
      <div className="h-full px-4 lg:px-8 flex items-center gap-4">
        <button
          onClick={onMenu}
          aria-label="Abrir navegação"
          className="lg:hidden -ml-1 p-2 rounded-lg text-muted hover:text-fg hover:bg-[var(--bp-hover)] transition-colors duration-[180ms]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeWidth={1.5} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        {/* Abaixo de lg a sidebar vira drawer e a marca sai da tela — aqui ela
            reaparece, na mesma altura do lockup da navegação. */}
        <Logo altura={18} className="lg:hidden" />

        <nav aria-label="Localização" className="min-w-0 flex items-center gap-2.5">
          <Dot tone="accent" />
          {current ? (
            <p className="min-w-0 flex items-baseline gap-2 truncate">
              <span className="t-label text-subtle">{current.moduleLabel}</span>
              <span className="text-subtle/50" aria-hidden>/</span>
              <span className="t-sm font-medium text-fg truncate">{current.label}</span>
            </p>
          ) : (
            <span className="t-label text-subtle">Bass Pago</span>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2 min-w-0">
          <RelogiosGlobais />
          <SinoNotificacoes />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
