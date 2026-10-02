'use client'

import { useEffect } from 'react'

/**
 * Sem este boundary, uma falha de servidor no segmento da pagina deixa a area
 * de conteudo vazia: o shell ja foi enviado e o erro nunca chega ao usuario.
 *
 * ── O QUE ELE NAO DEVE SER ──────────────────────────────────────────────
 *
 * Uma tela que diz "nao foi possivel carregar" e esconde o motivo. Ausencia
 * de dado NAO passa por aqui: cada tela tem o seu `EmptyState`, e lista vazia
 * nao e erro. Quando este boundary aparece, algo de fato estourou — e a
 * pergunta seguinte e sempre "o que".
 *
 * O `digest` e a unica ponte entre o que o usuario ve e o log do servidor
 * (o Next nao envia a mensagem do erro ao cliente, de proposito). Por isso
 * ele e exibido com rotulo e selecionavel, e o erro vai para o console do
 * navegador — onde quem esta investigando consegue ler sem pedir acesso ao
 * painel da Vercel.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // O console do navegador registra o que a tela nao pode mostrar. Em
    // producao a mensagem vem redigida pelo Next; o `digest` correlaciona com
    // o log do servidor, que tem o texto inteiro.
    console.error('[dashboard] falha ao renderizar o segmento', {
      mensagem: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error])

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
          <p className="mt-4 t-mono text-subtle">
            {/* SELECIONAVEL de proposito: e o unico identificador que liga
                esta tela ao log do servidor, e quem reporta precisa copia-lo. */}
            referência: <span className="select-all text-muted">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  )
}
