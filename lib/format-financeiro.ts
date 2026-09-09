/**
 * APRESENTAÇÃO DE NÚMEROS FINANCEIROS — só formatação, nenhuma regra de negócio.
 *
 * O problema que isto resolve: "R$ 159592207.57" é ilegível num KPI. A leitura
 * executiva quer a ordem de grandeza primeiro ("R$ 159,6 mi") e o valor exato
 * sob demanda (title/tooltip). Nada aqui inventa, arredonda para cima nem
 * esconde dado — apenas escolhe a escala certa e devolve o valor cheio junto.
 */

const NBSP = ' '

export interface Figura {
  /** Número já formatado, sem unidade. Ex.: "159,6" */
  valor: string
  /** Sufixo de escala. Ex.: "mi". Vazio quando não há. */
  unidade: string
  /** Prefixo. Ex.: "R$". Vazio quando não há. */
  prefixo: string
  /** Valor por extenso, para title/tooltip. Ex.: "R$ 159.592.207,57" */
  completo: string
}

const ESCALAS: Array<{ limite: number; divisor: number; sufixo: string }> = [
  { limite: 1e12, divisor: 1e12, sufixo: 'tri' },
  { limite: 1e9, divisor: 1e9, sufixo: 'bi' },
  { limite: 1e6, divisor: 1e6, sufixo: 'mi' },
  { limite: 1e3, divisor: 1e3, sufixo: 'mil' },
]

function br(n: number, min = 0, max = 2): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })
}

/** Casas decimais só quando mudam a leitura: 159,6 mi mas 160 mi, não 160,0 mi. */
function comEscala(n: number, casas = 1): { valor: string; unidade: string } {
  const abs = Math.abs(n)
  for (const e of ESCALAS) {
    if (abs >= e.limite) {
      const v = n / e.divisor
      // Acima de 100 na escala, a decimal não acrescenta informação.
      const d = Math.abs(v) >= 100 ? 0 : casas
      return { valor: br(v, 0, d), unidade: e.sufixo }
    }
  }
  return { valor: br(n, 0, abs < 10 && !Number.isInteger(n) ? 2 : 0), unidade: '' }
}

/** Moeda compacta. `R$ 159,6 mi` com o valor cheio disponível. */
export function figuraMoeda(n: number): Figura {
  const { valor, unidade } = comEscala(n)
  return {
    valor,
    unidade,
    prefixo: 'R$',
    completo: `R$${NBSP}${br(n, 2, 2)}`,
  }
}

/** Quantidade compacta (transações, MEDs). Sem prefixo. */
export function figuraQuantidade(n: number): Figura {
  const { valor, unidade } = comEscala(n)
  return { valor, unidade, prefixo: '', completo: br(n, 0, 0) }
}

/** Percentual. Casas fixas porque take rate precisa de precisão. */
export function figuraPercentual(n: number, casas = 2): Figura {
  return {
    valor: br(n, casas, casas),
    unidade: '%',
    prefixo: '',
    completo: `${br(n, casas, casas)}%`,
  }
}

/** Contagem simples (contas ativas, WL, BaaS). Nunca compacta. */
export function figuraContagem(n: number): Figura {
  return { valor: br(n, 0, 0), unidade: '', prefixo: '', completo: br(n, 0, 0) }
}

/* ---------- formatadores de string, para eixos e tooltips ---------------- */

export function moedaCompacta(n: number): string {
  const f = figuraMoeda(n)
  return `R$${NBSP}${f.valor}${f.unidade ? NBSP + f.unidade : ''}`
}

export function moedaCheia(n: number): string {
  return figuraMoeda(n).completo
}

export function quantidadeCompacta(n: number): string {
  const f = figuraQuantidade(n)
  return `${f.valor}${f.unidade ? NBSP + f.unidade : ''}`
}

export function percentual(n: number, casas = 2): string {
  return figuraPercentual(n, casas).completo
}

/* ---------- variação entre dois pontos ----------------------------------- */

export interface Variacao {
  /** Diferença percentual. null quando a base é zero ou ausente. */
  pct: number | null
  direcao: 'up' | 'down' | 'flat'
  /** Rótulo pronto: "+12,4%" / "−3,1%" / "estável" */
  rotulo: string
}

export function variacao(atual: number | null, anterior: number | null): Variacao | null {
  if (atual === null || anterior === null || !Number.isFinite(atual) || !Number.isFinite(anterior)) return null
  if (anterior === 0) return null
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100
  const direcao = Math.abs(pct) < 0.05 ? 'flat' : pct > 0 ? 'up' : 'down'
  const rotulo = direcao === 'flat'
    ? 'estável'
    : `${pct > 0 ? '+' : '−'}${br(Math.abs(pct), 1, 1)}%`
  return { pct, direcao, rotulo }
}
