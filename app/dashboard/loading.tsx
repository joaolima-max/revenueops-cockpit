import BrandMark from '@/components/ui/BrandMark'

export default function Loading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6">
      <BrandMark size={40} className="text-fg opacity-90" />

      <div className="w-40 h-px bg-line overflow-hidden rounded-full">
        <div className="h-full w-1/3 bg-accent animate-[bp-sweep_1.4s_ease-in-out_infinite]" />
      </div>

      <p className="t-label text-subtle">Carregando indicadores</p>

      <style>{`
        @keyframes bp-sweep {
          0%   { transform: translateX(-100%) }
          100% { transform: translateX(300%) }
        }
      `}</style>
    </div>
  )
}
