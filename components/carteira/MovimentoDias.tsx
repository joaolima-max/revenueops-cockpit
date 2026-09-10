'use client'

import { SIMBOLO_DIA, type EstadoDia } from '@/lib/carteira'

const TITULO: Record<EstadoDia, string> = {
  SIM: 'Movimentou', NAO: 'Não movimentou', SEM_REGISTRO: 'Sem registro',
}

const COR: Record<EstadoDia, string> = {
  SIM: 'text-pos', NAO: 'text-neg', SEM_REGISTRO: 'text-subtle',
}

/**
 * Faixa dos últimos dias de um cliente. Indicador operacional puro: diz se
 * houve movimentação, nunca quanto. Dia sem registro fica cinza, não vermelho.
 */
export default function MovimentoDias({ serie, onToggle }: {
  serie: Array<{ data: string; estado: EstadoDia }>
  onToggle?: (data: string, proximo: boolean) => void
}) {
  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label="Movimentação dos últimos dias">
      {serie.map(({ data, estado }) => {
        const rotulo = `${data.slice(8, 10)}/${data.slice(5, 7)}: ${TITULO[estado]}`
        const conteudo = (
          <span aria-hidden className={`t-sm leading-none ${COR[estado]}`}>{SIMBOLO_DIA[estado]}</span>
        )
        return onToggle ? (
          <button key={data} type="button" title={rotulo} aria-label={rotulo}
            onClick={() => onToggle(data, estado !== 'SIM')}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/[0.06] transition-colors duration-[180ms]">
            {conteudo}
          </button>
        ) : (
          <span key={data} title={rotulo} aria-label={rotulo} className="w-6 h-6 flex items-center justify-center">
            {conteudo}
          </span>
        )
      })}
    </div>
  )
}
