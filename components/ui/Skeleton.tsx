import { cn } from '@/lib/utils'

/** Carregamento com a FORMA do conteúdo final, não um spinner solto. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('bp-skeleton block', className)} />
}

/** Grade de KPIs em carregamento — espelha o HairlineGrid real. */
export function SkeletonTiles({ cols = 4 }: { cols?: number }) {
  return (
    <div className="grid gap-px bg-line border border-line rounded-2xl overflow-hidden
                    grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="bg-surface p-5 space-y-3">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  )
}

/** Linhas de tabela em carregamento. */
export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-40' : 'flex-1 max-w-24')} />
          ))}
        </div>
      ))}
    </div>
  )
}
