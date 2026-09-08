'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { activeFeatures } from '@/lib/modules'
import { Dot } from '@/components/ui/Badge'

/**
 * Barra superior — não existia. Cada tela inventava o próprio cabeçalho.
 * Traz localização (módulo › função) e o relógio discreto do site (.utc).
 */
export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname()
  const [clock, setClock] = useState<string | null>(null)

  // Só após montar: evita divergência de hidratação com o horário do servidor.
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZone: 'America/Sao_Paulo', hour12: false,
        }).format(new Date())
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const current = activeFeatures()
    .filter((f) => (f.exact ? pathname === f.route : pathname === f.route || pathname.startsWith(f.route + '/')))
    .sort((a, b) => b.route.length - a.route.length)[0]

  return (
    <header className="h-16 flex-none sticky top-0 z-30 bg-ink/85 backdrop-blur-md border-b border-line">
      <div className="h-full px-4 lg:px-8 flex items-center gap-4">
        <button
          onClick={onMenu}
          aria-label="Abrir navegação"
          className="lg:hidden -ml-1 p-2 rounded-lg text-muted hover:text-fg hover:bg-white/[0.06] transition-colors duration-[180ms]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeWidth={1.5} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <nav aria-label="Localização" className="min-w-0 flex items-center gap-2.5">
          <Dot tone="accent" />
          {current ? (
            <p className="min-w-0 flex items-baseline gap-2 truncate">
              <span className="t-label text-subtle">{current.moduleLabel}</span>
              <span className="text-subtle/50" aria-hidden>/</span>
              <span className="t-sm font-medium text-fg truncate">{current.label}</span>
            </p>
          ) : (
            <span className="t-label text-subtle">Bass Pago RevOps</span>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-white/[0.03]">
            <span className="t-label text-subtle">São Paulo</span>
            <span className="t-mono text-fg tabular-nums">{clock ?? '--:--:--'}</span>
          </span>
        </div>
      </div>
    </header>
  )
}
