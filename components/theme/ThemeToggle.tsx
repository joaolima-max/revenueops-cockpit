'use client'

import { useTheme } from './ThemeProvider'
import { cn } from '@/lib/utils'

/** Controle discreto de tema: um botão, dois ícones, troca instantânea. */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const claro = theme === 'light'

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={claro}
      aria-label={claro ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      title={claro ? 'Tema escuro' : 'Tema claro'}
      className={cn(
        'relative w-8 h-8 grid place-items-center rounded-lg border border-line',
        'text-muted hover:text-fg hover:border-line-2 hover:bg-[var(--bp-hover)]',
        'transition-colors duration-[180ms] ease-bp',
        className
      )}
    >
      {/* Os dois ícones convivem e trocam por opacidade/rotação — sem salto de layout. */}
      <svg
        className={cn('absolute w-4 h-4 transition-all duration-[380ms] ease-bp',
          claro ? 'opacity-0 -rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100')}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
      <svg
        className={cn('absolute w-4 h-4 transition-all duration-[380ms] ease-bp',
          claro ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-75')}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    </button>
  )
}
