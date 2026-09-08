import { cn } from '@/lib/utils'

/**
 * O motivo assinatura da Bass Pago (.mgrid / .ctrl / .pillars / .scale do site):
 * um único contorno para o conjunto e fios de 1px entre as células — em vez de
 * um cartão com borda para cada item. É o que elimina o "excesso de cards".
 *
 * As células devem ter fundo sólido (use <HairlineCell>), senão o gap some.
 */
export default function HairlineGrid({
  cols = 4, className, children,
}: { cols?: 2 | 3 | 4 | 5 | 6; className?: string; children: React.ReactNode }) {
  const grid = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }[cols]

  return (
    <div className={cn('grid gap-px bg-line border border-line rounded-2xl overflow-hidden', grid, className)}>
      {children}
    </div>
  )
}

export function HairlineCell({
  className, children, interactive = true, ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      {...rest}
      className={cn(
        'bg-surface p-5 flex flex-col',
        interactive && 'transition-colors duration-[380ms] ease-bp hover:bg-surface-2',
        className
      )}
    >
      {children}
    </div>
  )
}
