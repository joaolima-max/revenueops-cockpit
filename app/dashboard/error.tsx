'use client'

/**
 * Sem este boundary, uma falha de servidor no segmento da pagina deixa a area
 * de conteudo vazia: o shell ja foi enviado e o erro nunca chega ao usuario.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-surface border border-line rounded-2xl p-8 text-center">
        <div className="w-10 h-10 rounded-full bg-neg/10 border border-neg/25 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-neg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="t-h3 text-fg mb-1.5">Não foi possível carregar esta página</h2>
        <p className="t-sm text-subtle leading-relaxed mb-6">
          Houve uma falha ao buscar os dados. Tente novamente; se persistir, acione o suporte técnico.
        </p>
        <button
          onClick={reset}
          className="bp-btn-primary px-4 py-2 rounded-lg text-xs font-semibold"
        >
          Tentar novamente
        </button>
        {error.digest && (
          <p className="mt-4 text-[10px] text-subtle tracking-wide">referência: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
