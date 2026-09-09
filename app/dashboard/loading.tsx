import { SkeletonTiles, Skeleton } from '@/components/ui/Skeleton'

/** Esqueleto com a forma da tela, em vez de um logo girando. */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="pb-6 border-b border-line space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3 w-80" />
      </div>
      <SkeletonTiles />
      <SkeletonTiles />
      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1].map(i => (
          <div key={i} className="bg-surface border border-line rounded-2xl p-6 space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-[190px] w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando indicadores…</span>
    </div>
  )
}
