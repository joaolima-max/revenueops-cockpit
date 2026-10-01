/**
 * VELAS (candlestick) — agregação OHLC de uma série temporal real.
 *
 * NADA AQUI É INVENTADO. O produto não tem cotação intradiária: cada métrica
 * tem no máximo uma observação por dia, vinda do Lançamento Diário. Um candle
 * diário, nessas condições, teria abertura = fechamento = máxima = mínima — um
 * traço, não uma vela.
 *
 * Então a vela é construída sobre a JANELA AGREGADA. Agrupando por semana ou
 * por mês, as observações diárias dentro da janela formam o OHLC de verdade:
 *
 *   Open  = primeiro valor da janela (em ordem de data)
 *   High  = maior valor da janela
 *   Low   = menor valor da janela
 *   Close = último valor da janela
 *
 * É agregação, não simulação: todo número devolvido é um valor que foi
 * efetivamente observado em algum dia daquela janela.
 *
 * Isto NÃO transforma o produto numa interface de trading. É leitura de
 * crescimento: o corpo mostra o movimento líquido da janela e as sombras
 * mostram a dispersão dentro dela — informação que a linha média esconde.
 */

export interface Observacao {
  /** Data da observação. Uma por dia, no máximo. */
  data: Date
  /** O valor observado. Null = dia sem lançamento, e é descartado. */
  valor: number | null
}

export interface Vela {
  /** Identificador da janela: "2026-10" (mês) ou "2026-W40" (semana). */
  janela: string
  rotulo: string
  open: number
  high: number
  low: number
  close: number
  /** Quantas observações reais formaram a vela. Entra no tooltip. */
  observacoes: number
  /** Primeira e última data observadas — o período que o tooltip declara. */
  de: Date
  ate: Date
  /** close ≥ open. Decide a cor, nada mais. */
  alta: boolean
}

export type Granularidade = 'MES' | 'SEMANA'

function chaveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Semana ISO. Usa a quinta-feira da semana para achar o ano correto — a
 * semana que atravessa o réveillon pertence ao ano que tem mais dias nela, e
 * sem isso 29/12 e 02/01 cairiam em janelas de anos diferentes.
 */
function chaveSemana(d: Date): string {
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const diaIso = base.getUTCDay() === 0 ? 7 : base.getUTCDay()
  base.setUTCDate(base.getUTCDate() + 4 - diaIso)
  const ano = base.getUTCFullYear()
  const primeiro = new Date(Date.UTC(ano, 0, 1))
  const semana = Math.ceil(((base.getTime() - primeiro.getTime()) / 86400000 + 1) / 7)
  return `${ano}-W${String(semana).padStart(2, '0')}`
}

function rotuloDe(janela: string, granularidade: Granularidade, de: Date): string {
  if (granularidade === 'SEMANA') return janela.replace('-W', ' · S')
  return de.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

/**
 * Agrega observações diárias em velas.
 *
 * Dias sem valor são DESCARTADOS, nunca tratados como zero: um dia sem
 * lançamento é ausência de informação, e um zero puxaria a mínima da vela
 * para baixo inventando uma queda que não houve.
 *
 * Janela sem nenhuma observação não produz vela — o eixo fica com o buraco,
 * que é a verdade.
 */
export function velas(
  obs: Observacao[], granularidade: Granularidade = 'MES',
): Vela[] {
  const chave = granularidade === 'SEMANA' ? chaveSemana : chaveMes

  const grupos = new Map<string, Array<{ data: Date; valor: number }>>()
  for (const o of obs) {
    if (o.valor === null || !Number.isFinite(o.valor)) continue
    const k = chave(o.data)
    const lista = grupos.get(k) ?? []
    lista.push({ data: o.data, valor: o.valor })
    grupos.set(k, lista)
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([janela, lista]) => {
      lista.sort((a, b) => a.data.getTime() - b.data.getTime())
      const valores = lista.map((x) => x.valor)
      const open = valores[0]
      const close = valores[valores.length - 1]
      return {
        janela,
        rotulo: rotuloDe(janela, granularidade, lista[0].data),
        open,
        high: Math.max(...valores),
        low: Math.min(...valores),
        close,
        observacoes: lista.length,
        de: lista[0].data,
        ate: lista[lista.length - 1].data,
        alta: close >= open,
      }
    })
}

/**
 * A vela é um traço? (uma única observação na janela, ou todas iguais)
 *
 * A tela precisa saber para avisar: uma janela com um dia só não tem máxima
 * nem mínima, e desenhá-la como vela sugere uma dispersão que não foi medida.
 */
export function velaDegenerada(v: Vela): boolean {
  return v.observacoes < 2 || (v.high === v.low)
}

/** Variação percentual do corpo da vela. Null quando a abertura é zero. */
export function variacaoDaVela(v: Vela): number | null {
  return v.open !== 0 ? ((v.close - v.open) / Math.abs(v.open)) * 100 : null
}
