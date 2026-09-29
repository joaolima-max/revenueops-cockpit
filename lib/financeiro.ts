/**
 * FINANCEIRO — regras de negócio do ambiente. Uma fonte por número.
 *
 *   LancamentoFinanceiro  → Receita, Despesa, Resultado, Gasto por categoria
 *   CondicaoComercial     → MRR (2 parcelas), BaaS ativos, White Labels ativos
 *   Cliente.mensalidadeApi→ MRR (1 parcela)
 *   ContaReceber          → Inadimplência
 *   LancamentoDiario      → Clientes ativos (ver lib/kpi.ts)
 *
 * Nada aqui persiste indicador calculado. Não existe tabela de analytics
 * financeiro: todo número desta pasta é derivado na leitura, das tabelas acima.
 */

import { prisma } from '@/lib/prisma'
import { intervaloMes } from '@/lib/periodo'

/* ========================================================================= *
 * MRR / ARR
 * ========================================================================= */

/**
 * As quatro parcelas que compõem o MRR, explícitas para que a tela possa
 * mostrar de onde vem cada real e ninguém precise confiar num total opaco.
 */
export interface Mrr {
  /** Sustentação de TODOS os BaaS ativos. Campo: CondicaoComercial.sustentacao (tipo BAAS). */
  sustentacaoBaas: number
  /** Sustentação de TODOS os White Labels ativos. Campo: CondicaoComercial.sustentacao (tipo WHITE_LABEL). */
  sustentacaoWhiteLabel: number
  /** Mensalidade de API dos BaaS e White Labels. Campo: CondicaoComercial.apiMensal. */
  apiMensalParceiros: number
  /** Mensalidade de API dos clientes da Carteira. Campo: Cliente.mensalidadeApi (status ATIVO). */
  apiMensalCarteira: number
  /** Soma das quatro parcelas acima. */
  total: number
}

/**
 * MRR pelas condições ATUAIS.
 *
 * REGRA (§14 da especificação):
 *   MRR = sustentação de todos os BaaS
 *       + sustentação de todos os White Labels
 *       + mensalidades de API dos BaaS/White Labels
 *       + mensalidades de API dos clientes cadastrados na Carteira
 *
 * SEM DUPLA CONTAGEM: a mensalidade de API de um parceiro mora em
 * `CondicaoComercial.apiMensal` e a de um cliente da carteira em
 * `Cliente.mensalidadeApi`. São campos de tabelas diferentes, preenchidos em
 * telas diferentes — um parceiro BaaS não é contado como cliente da carteira,
 * nem o contrário.
 *
 * HISTÓRICO DE TAXAS: o MRR usa sempre o valor vigente na linha de
 * CondicaoComercial. `CondicaoComercialHistorico` existe para auditoria e NÃO
 * participa deste cálculo — alterar uma taxa hoje muda o MRR de hoje e não
 * reescreve o MRR que já foi reportado.
 */
export async function calcularMrr(): Promise<Mrr> {
  const [porTipo, carteira] = await Promise.all([
    prisma.condicaoComercial.groupBy({
      by: ['tipo'],
      where: { ativo: true },
      _sum: { sustentacao: true, apiMensal: true },
    }),
    prisma.cliente.aggregate({
      where: { status: 'ATIVO' },
      _sum: { mensalidadeApi: true },
    }),
  ])

  const doTipo = (tipo: 'BAAS' | 'WHITE_LABEL') => porTipo.find((p) => p.tipo === tipo)?._sum

  const sustentacaoBaas = doTipo('BAAS')?.sustentacao ?? 0
  const sustentacaoWhiteLabel = doTipo('WHITE_LABEL')?.sustentacao ?? 0
  const apiMensalParceiros = porTipo.reduce((a, p) => a + (p._sum.apiMensal ?? 0), 0)
  const apiMensalCarteira = carteira._sum.mensalidadeApi ?? 0

  return {
    sustentacaoBaas,
    sustentacaoWhiteLabel,
    apiMensalParceiros,
    apiMensalCarteira,
    total: sustentacaoBaas + sustentacaoWhiteLabel + apiMensalParceiros + apiMensalCarteira,
  }
}

/** ARR = MRR × 12. Mesma fonte, nenhuma projeção de crescimento embutida. */
export function arrDoMrr(mrr: number): number {
  return mrr * 12
}

/* ========================================================================= *
 * CONTAGENS DE PARCEIROS
 * ========================================================================= */

export interface ContagensParceiros {
  baasAtivos: number
  whiteLabelsAtivos: number
}

/**
 * BaaS e White Labels ativos — contagem das linhas ativas de
 * CondicaoComercial, que é onde eles são cadastrados (Financeiro → Condições
 * Comerciais BaaS).
 *
 * Mesma função serve Financeiro, Cockpit e Conselho. Não existe uma segunda
 * consulta em nenhum desses lugares.
 */
export async function contagensParceiros(): Promise<ContagensParceiros> {
  const porTipo = await prisma.condicaoComercial.groupBy({
    by: ['tipo'],
    where: { ativo: true },
    _count: true,
  })
  const conta = (tipo: 'BAAS' | 'WHITE_LABEL') => porTipo.find((p) => p.tipo === tipo)?._count ?? 0
  return { baasAtivos: conta('BAAS'), whiteLabelsAtivos: conta('WHITE_LABEL') }
}

/* ========================================================================= *
 * LANÇAMENTOS DO PERÍODO
 * ========================================================================= */

export interface ResultadoPeriodo {
  receita: number
  despesa: number
  /** Receita − Despesa. Negativo quando a despesa supera a receita. */
  resultado: number
}

/**
 * Receita, Despesa e Resultado de um mês "YYYY-MM".
 *
 * CANCELADO fica fora: é lançamento que não aconteceu. PENDENTE entra, porque
 * a tela de Lançamentos é de competência (a data do lançamento), não de caixa.
 */
export async function resultadoDoPeriodo(periodo: string): Promise<ResultadoPeriodo> {
  const { inicio, fim } = intervaloMes(periodo)

  const porTipo = await prisma.lancamentoFinanceiro.groupBy({
    by: ['tipo'],
    where: { data: { gte: inicio, lt: fim }, status: { not: 'CANCELADO' } },
    _sum: { valor: true },
  })

  const soma = (tipo: 'RECEITA' | 'DESPESA') =>
    porTipo.find((p) => p.tipo === tipo)?._sum.valor ?? 0

  const receita = soma('RECEITA')
  const despesa = soma('DESPESA')
  return { receita, despesa, resultado: receita - despesa }
}

export interface GastoCategoria {
  categoriaId: string
  nome: string
  total: number
}

/** Gasto por categoria no período. Só despesas, maior primeiro. */
export async function gastoPorCategoria(periodo: string): Promise<GastoCategoria[]> {
  const { inicio, fim } = intervaloMes(periodo)

  const grupos = await prisma.lancamentoFinanceiro.groupBy({
    by: ['categoriaId'],
    where: { tipo: 'DESPESA', data: { gte: inicio, lt: fim }, status: { not: 'CANCELADO' } },
    _sum: { valor: true },
  })
  if (grupos.length === 0) return []

  const categorias = await prisma.categoriaFinanceira.findMany({
    where: { id: { in: grupos.map((g) => g.categoriaId) } },
    select: { id: true, nome: true },
  })
  const nomeDe = new Map(categorias.map((c) => [c.id, c.nome]))

  return grupos
    .map((g) => ({
      categoriaId: g.categoriaId,
      nome: nomeDe.get(g.categoriaId) ?? 'Sem categoria',
      total: g._sum.valor ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/* ========================================================================= *
 * RECEITA POR WHITE LABEL
 * ========================================================================= */

export interface ReceitaWhiteLabel {
  id: string
  nomeFantasia: string
  identificacao: string
  sustentacao: number
  apiMensal: number
  /** Receita recorrente do White Label: sustentação + API mensal. */
  total: number
}

/**
 * Receita recorrente por White Label, direto das condições comerciais vigentes.
 *
 * NÃO é TPV nem receita tarifária por parceiro: essas não existem por
 * parceiro no sistema — o lançamento diário é global, por decisão de produto.
 * O que existe por White Label são as duas mensalidades contratadas.
 */
export async function receitaPorWhiteLabel(): Promise<ReceitaWhiteLabel[]> {
  const wls = await prisma.condicaoComercial.findMany({
    where: { tipo: 'WHITE_LABEL', ativo: true },
    select: { id: true, nomeFantasia: true, identificacao: true, sustentacao: true, apiMensal: true },
    orderBy: { nomeFantasia: 'asc' },
  })

  return wls
    .map((w) => {
      const sustentacao = w.sustentacao ?? 0
      const apiMensal = w.apiMensal ?? 0
      return {
        id: w.id,
        nomeFantasia: w.nomeFantasia,
        identificacao: w.identificacao,
        sustentacao,
        apiMensal,
        total: sustentacao + apiMensal,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/* ========================================================================= *
 * INADIMPLÊNCIA
 * ========================================================================= */

export interface Inadimplencia {
  valor: number
  titulos: number
  /** Percentual do faturado do período. null quando não houve faturamento. */
  percentual: number | null
}

/**
 * Inadimplência do período, de ContaReceber — a única tabela do sistema que
 * tem o estado de cobrança de um título.
 */
export async function inadimplenciaDoPeriodo(periodo: string): Promise<Inadimplencia> {
  const { inicio, fim } = intervaloMes(periodo)
  const janela = { dataVenc: { gte: inicio, lt: fim } }

  const [inad, total] = await Promise.all([
    prisma.contaReceber.aggregate({
      where: { ...janela, status: 'INADIMPLENTE' },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.contaReceber.aggregate({
      where: { ...janela, status: { not: 'PENDENTE' } },
      _sum: { valor: true },
    }),
  ])

  const valor = inad._sum.valor ?? 0
  const base = total._sum.valor ?? 0
  return {
    valor,
    titulos: inad._count,
    percentual: base > 0 ? (valor / base) * 100 : null,
  }
}

/* ========================================================================= *
 * VISÃO GERAL
 * ========================================================================= */

export interface VisaoGeralFinanceiro {
  periodo: string
  mrr: Mrr
  arr: number
  resultado: ResultadoPeriodo
  inadimplencia: Inadimplencia
  gastoPorCategoria: GastoCategoria[]
  receitaPorWhiteLabel: ReceitaWhiteLabel[]
  parceiros: ContagensParceiros
}

/** Tudo que a Visão Geral mostra, numa ida só ao banco. */
export async function visaoGeralFinanceiro(periodo: string): Promise<VisaoGeralFinanceiro> {
  const [mrr, resultado, inadimplencia, gastos, wls, parceiros] = await Promise.all([
    calcularMrr(),
    resultadoDoPeriodo(periodo),
    inadimplenciaDoPeriodo(periodo),
    gastoPorCategoria(periodo),
    receitaPorWhiteLabel(),
    contagensParceiros(),
  ])

  return {
    periodo,
    mrr,
    arr: arrDoMrr(mrr.total),
    resultado,
    inadimplencia,
    gastoPorCategoria: gastos,
    receitaPorWhiteLabel: wls,
    parceiros,
  }
}

/* ========================================================================= *
 * PARCELAS E RECORRÊNCIA
 * ========================================================================= */

/** Soma `n` meses a uma data, preservando o dia quando o mês de destino o tem. */
function somarMeses(base: Date, n: number): Date {
  const ano = base.getUTCFullYear()
  const mes = base.getUTCMonth()
  const dia = base.getUTCDate()
  // Dia 31 em mês de 30: cai no último dia do mês de destino, não vira o mês.
  const ultimoDiaDestino = new Date(Date.UTC(ano, mes + n + 1, 0)).getUTCDate()
  return new Date(Date.UTC(ano, mes + n, Math.min(dia, ultimoDiaDestino)))
}

export interface LinhaGerada {
  data: Date
  valor: number
  parcela: number | null
  totalParcelas: number | null
}

/**
 * Expande um cadastro de lançamento nas linhas que serão gravadas.
 *
 * Por que materializar em vez de guardar "é recorrente" e expandir na leitura:
 * com linhas reais, Receita, Despesa e Resultado de qualquer período são uma
 * soma direta sobre `data`. Sem isso, cada tela precisaria repetir a regra de
 * expansão — e é aí que os números começam a divergir entre si.
 *
 *   UNICA      → 1 linha
 *   PARCELADA  → `totalParcelas` linhas mensais; valor é o da parcela
 *   RECORRENTE → 1 linha por mês até `meses` (padrão 12), mesmo valor
 */
export function expandirLancamento(
  periodicidade: 'UNICA' | 'RECORRENTE' | 'PARCELADA',
  data: Date,
  valor: number,
  opcoes: { totalParcelas?: number | null; meses?: number | null } = {},
): LinhaGerada[] {
  if (periodicidade === 'PARCELADA') {
    const n = Math.max(1, Math.round(opcoes.totalParcelas ?? 1))
    return Array.from({ length: n }, (_, i) => ({
      data: somarMeses(data, i),
      valor,
      parcela: i + 1,
      totalParcelas: n,
    }))
  }

  if (periodicidade === 'RECORRENTE') {
    const n = Math.max(1, Math.round(opcoes.meses ?? 12))
    return Array.from({ length: n }, (_, i) => ({
      data: somarMeses(data, i),
      valor,
      parcela: null,
      totalParcelas: null,
    }))
  }

  return [{ data, valor, parcela: null, totalParcelas: null }]
}
