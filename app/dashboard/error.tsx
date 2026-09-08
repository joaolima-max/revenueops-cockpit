'use client'

/**
 * Sem este boundary, uma falha de servidor no segmento da pagina deixa a area
 * de conteudo vazia: o shell ja foi enviado e o erro nunca chega ao usuario.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-white text-sm font-semibold mb-1.5">Não foi possível carregar esta página</h2>
        <p className="text-gray-500 text-xs leading-relaxed mb-5">
          Houve uma falha ao buscar os dados. Tente novamente; se persistir, acione o suporte técnico.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #00E5A0 100%)' }}
        >
          Tentar novamente
        </button>
        {error.digest && (
          <p className="mt-4 text-[10px] text-gray-700 tracking-wide">referência: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
