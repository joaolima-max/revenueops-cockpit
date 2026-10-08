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
 * ── TRÊS ESTADOS, TRÊS FRASES ───────────────────────────────────────────
 *
 * A linha muda de conteúdo em vez de desaparecer, porque os três estados
 * exigem condutas diferentes de quem lê:
 *
 *   ANIMANDO    diz a competência, o horário do registro e que o número é
 *               distribuição, não captura.
 *
 *   AGUARDANDO  o lançamento já existe, mas foi registrado antes das 10h e o
 *               ciclo dele não abriu. "A distribuição começa às 10h" —
 *               esperar é a conduta certa, e é diferente de não haver dado.
 *
 *   SEM DADO    nenhum lançamento no ciclo. O painel mostra o acumulado
 *               registrado, parado, e isso é diferente de estar quebrado.
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
  referencia, pendente, inicio, quantos,
}: {
  /** O lançamento mais recente do ciclo. `null` = ciclo sem lançamento. */
  referencia: LancamentoDoCiclo | null
  /**
   * O lançamento já registrado cujo ciclo ainda não começou.
   *
   * Acontece entre 00h e 10h. A tela declara a ESPERA — e declará-la é o que
   * distingue "ainda não deu a hora" de "não há dado", que exigem condutas
   * diferentes de quem lê.
   */
  pendente: LancamentoDoCiclo | null
  /** Início do ciclo, em ISO. */
  inicio: string
  /** Quantos lançamentos entraram no ciclo. */
  quantos: number
}) {
  if (!referencia && pendente) {
    return (
      <p className="t-sm text-subtle">
        Lançamento de{' '}
        <span className="text-fg">{competenciaCurta(pendente.competencia)}</span>{' '}
        registrado em{' '}
        <span className="text-fg tabular-nums">
          {DATA_HORA.format(new Date(pendente.registradoEm)).replace(', ', ' às ')}
        </span>
        , antes da abertura do ciclo —{' '}
        <span className="text-fg">
          a distribuição começa às {HORA_INICIO_CICLO}h
        </span>
        . Até lá os indicadores de volume mostram o acumulado do ciclo anterior.
      </p>
    )
  }

  if (!referencia) {
    return (
      <p className="t-sm text-subtle">
        Nenhum lançamento novo no ciclo iniciado em{' '}
        <span className="text-fg">{DATA.format(new Date(inicio))} às {HORA_INICIO_CICLO}h</span>
        {' '}— os indicadores de volume mostram o acumulado já registrado,
        parados, até o próximo lançamento.
      </p>
    )
  }

  return (
    <p className="t-sm text-subtle">
      Indicadores de volume{' '}
      <span className="text-fg">distribuídos ao longo do ciclo operacional</span>{' '}
      ({HORA_INICIO_CICLO}h às {HORA_INICIO_CICLO}h, com ritmo dobrado entre 18h e 20h
      e reduzido na madrugada).
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
