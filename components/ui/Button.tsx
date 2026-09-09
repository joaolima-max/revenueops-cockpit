'use client'

import { cn } from '@/lib/utils'

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bp-btn-primary border border-transparent',
  ghost: 'border border-line text-fg hover:border-line-2 hover:bg-[var(--bp-hover)]',
  subtle: 'border border-transparent text-muted hover:text-fg hover:bg-[var(--bp-hover)]',
  danger: 'border border-neg/30 text-neg hover:bg-neg/10 hover:border-neg/50',
}

export default function Button({
  variant = 'ghost', size = 'md', className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap',
        'transition-colors duration-[180ms] ease-bp',
        'disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' ? 'px-3 py-1.5 t-sm' : 'px-4 py-2.5 text-[0.875rem]',
        VARIANT[variant], className
      )}
    />
  )
}
