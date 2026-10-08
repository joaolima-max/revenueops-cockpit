import { FUSO_OPERACIONAL, HORA_INICIO_CICLO } from '@/lib/projecao-intradiaria'
import type { LancamentoDoCiclo } from '@/lib/projecao'

/**
 * A DECLARAÇÃO DA PROJEÇÃO — o que o número está fazendo, em uma linha.
 *
 * ── POR QUE ESTA LINHA É OBRIGATÓRIA ────────────────────────────────────
 *
 * Um número que cresce sozinho na tela é lido como "dado chegando agora". A
 * Bass Pago NÃO recebe eventos transacionais em tempo real: o volume é lançado
 * à mão, uma vez por dia, referente ao dia anterior.
 *
 * Sem esta frase, a animação seria uma afirmação falsa sobre a origem do dado
 * — e uma afirmação que o painel executivo faz em silêncio. Então ela diz as
 * três coisas que importam: a competência do volume, quando ele foi
 * REGISTRADO, e que o que se vê é distribuição, não captura.
 *
 * Nenhuma variação de "ao vivo", "em tempo real" ou "transações agora" aparece
 * aqui, de propósito.
 *
 * ── E QUANDO NÃO HÁ CICLO NOVO ──────────────────────────────────────────
 *
 * A linha muda de conteúdo em vez de desaparecer. "Nenhum lançamento novo
 * neste ciclo" é a informação certa — o painel está mostrando o acumulado
 * registrado, parado, e isso é diferente de estar quebrado.
 */

const DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_OPERACIONAL, day: '2-digit', month: '2-digit',
})

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_OPERACIONAL, day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

/** "07/10" a partir de uma competência "YYYY-MM-DD", sem deslocar o dia. */
function competenciaCurta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function NotaProjecao({
  referencia, inicio, quantos,
}: {
  /** O lançamento mais recente do ciclo. `null` = ciclo sem lançamento. */
  referencia: LancamentoDoCiclo | null
  /** Início do ciclo, em ISO. */
  inicio: string
  /** Quantos lançamentos entraram no ciclo. */
  quantos: number
}) {
  if (!referencia) {
    return (
      <p className="t-sm text-subtle">
        Nenhum lançamento novo no ciclo iniciado em{' '}
        <span className="text-fg">{DATA.format(new Date(inicio))} às {HORA_INICIO_CICLO}h</span>
        {' '}— os indicadores de volume mostram o acumulado já registrado.
      </p>
    )
  }

  return (
    <p className="t-sm text-subtle">
      Indicadores de volume{' '}
      <span className="text-fg">distribuídos ao longo do ciclo operacional</span>{' '}
      ({HORA_INICIO_CICLO}h às {HORA_INICIO_CICLO}h, com ritmo dobrado entre 18h e 20h).
      {' '}Referência:{' '}
      <span className="text-fg">
        {quantos > 1
          ? `${quantos} lançamentos, o último de ${competenciaCurta(referencia.competencia)}`
          : `lançamento de ${competenciaCurta(referencia.competencia)}`}
      </span>
      , registrado em{' '}
      <span className="text-fg tabular-nums">
        {DATA_HORA.format(new Date(referencia.registradoEm)).replace(', ', ' às ')}
      </span>
      . O total do ciclo é o valor lançado — não há captura transacional contínua.
    </p>
  )
}
