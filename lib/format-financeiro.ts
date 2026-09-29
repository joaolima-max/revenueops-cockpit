/**
 * APRESENTAÇÃO DE NÚMEROS FINANCEIROS — só formatação, nenhuma regra de negócio.
 *
 * REGRA GLOBAL: valor monetário é exibido POR EXTENSO, sempre.
 *
 *   R$ 4.250.000,00        ← sim
 *   R$ 4,25 mi / 4,25 MM   ← não
 *
 * A abreviação por escala (mil/mi/bi/tri) foi removida em toda a superfície:
 * Cockpit, Financeiro, Conselho, Carteira, gráficos, tooltips, tabelas e cards.
 * O motivo é operacional, não estético — quem opera a mesa precisa conferir
 * centavos, e um KPI que arredonda para "R$ 4,25 mi" esconde exatamente a parte
 * que está sendo conferida.
 *
 * Este é o único formatador financeiro do sistema. Não criar outro local: se um
 * número aparece diferente em duas telas, é porque alguém formatou por fora.
 */

const NBSP = ' '

export interface Figura {
  /** Número já formatado, sem unidade. Ex.: "4.250.000,00" */
  valor: string
  /**
   * Sufixo de escala. Sempre vazio em valores monetários e em quantidades —
   * o campo continua existindo porque percentuais usam "%".
   */
  unidade: string
  /** Prefixo. Ex.: "R$". Vazio quando não há. */
  prefixo: string
  /** Valor por extenso, para title/tooltip. Ex.: "R$ 4.250.000,00" */
  completo: string
}

function br(n: number, min = 0, max = 2): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })
}

/**
 * Moeda. Duas casas decimais fixas: em dinheiro, "R$ 1.000" e "R$ 1.000,00"
 * não são a mesma informação para quem confere.
 */
export function figuraMoeda(n: number): Figura {
  const texto = br(n, 2, 2)
  return { valor: texto, unidade: '', prefixo: 'R$', completo: `R$${NBSP}${texto}` }
}

/** Quantidade (transações, MEDs). Inteiro exato, sem escala. */
export function figuraQuantidade(n: number): Figura {
  const texto = br(n, 0, 0)
  return { valor: texto, unidade: '', prefixo: '', completo: texto }
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

/** Contagem simples (BaaS ativos, White Labels, clientes ativos). */
export function figuraContagem(n: number): Figura {
  return { valor: br(n, 0, 0), unidade: '', prefixo: '', completo: br(n, 0, 0) }
}

/* ---------- formatadores de string, para eixos e tooltips ---------------- */

export function moedaCheia(n: number): string {
  return figuraMoeda(n).completo
}

export function quantidadeCompacta(n: number): string {
  return figuraQuantidade(n).completo
}

export function percentual(n: number, casas = 2): string {
  return figuraPercentual(n, casas).completo
}

/**
 * Rótulo de eixo de gráfico. Único lugar com concessão de espaço: um eixo Y
 * com "R$ 4.250.000,00" repetido seis vezes fica ilegível. Ainda assim NÃO
 * abrevia com letra — corta os centavos e mantém os milhares, que é redução de
 * precisão visível e não troca de escala silenciosa. Tooltips e cards do mesmo
 * gráfico continuam mostrando o valor cheio.
 */
export function eixoMoeda(n: number): string {
  return `R$${NBSP}${br(n, 0, 0)}`
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
