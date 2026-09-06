/**
 * REGISTRO DE KPIs — cada indicador tem UMA fonte oficial.
 *
 *   LancamentoDiario → TPV, Receita Tarifária, Saldo em Conta, Transações, MEDs
 *   FloatConfig      → multiplicador do Float (derivado, nunca lançado)
 *   Cliente          → MRR, WL Ativos, Contas Ativas, BaaS Ativos
 *   ContaReceber     → Setup e Serviços
 *   Meta             → objetivos (somente o alvo)
 *
 * Regra que substitui os 36 fallbacks anteriores: quando não há dado, o valor é
 * `null` e a tela mostra estado vazio. Zero é usado apenas quando é o resultado
 * matemático correto. Nenhum indicador troca de origem silenciosamente.
 */

import { prisma } from '@/lib/prisma'
import { calcularFloat, type SaldoDia, type VigenciaMultiplicador } from '@/lib/float'

/** Primeiro instante do mês e o primeiro do mês seguinte, para "YYYY-MM". */
export function intervaloMes(periodo: string): { inicio: Date; fim: Date } {
  const [ano, mes] = periodo.split('-').map(Number)
  return { inicio: new Date(Date.UTC(ano, mes - 1, 1)), fim: new Date(Date.UTC(ano, mes, 1)) }
}

export function periodoAtual(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Os N períodos "YYYY-MM" terminando no mês corrente. */
export function ultimosPeriodos(n: number): string[] {
  const h = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - (n - 1 - i), 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

export interface KpisPeriodo {
  periodo: string
  /** Falso quando não há nenhum lançamento no período — a tela mostra vazio. */
  temDados: boolean
  diasLancados: number
  tpv: number | null
  receitaTarifaria: number | null
  qtdTransacoes: number | null
  qtdMed: number | null
  saldoMedio: number | null
  float: number | null
  takeRate: number | null
  percentMed: number | null
}

/** Vigências do multiplicador, ordenadas. Uma consulta serve todos os períodos. */
async function vigenciasFloat(): Promise<VigenciaMultiplicador[]> {
  const configs = await prisma.floatConfig.findMany({ orderBy: { vigenciaInicio: 'asc' } })
  return configs.map((c) => ({ vigenciaInicio: c.vigenciaInicio, multiplicador: c.multiplicador }))
}

/**
 * KPIs de um mês, todos derivados do lançamento diário.
 *
 * O Float precisa do dia seguinte ao fim do mês para saber o que dormiu na
 * virada, por isso a janela busca um dia a mais e depois recorta.
 */
export async function kpisDoPeriodo(periodo: string): Promise<KpisPeriodo> {
  const { inicio, fim } = intervaloMes(periodo)
  const fimComVirada = new Date(fim.getTime() + 86_400_000)

  const [lancamentos, vigencias] = await Promise.all([
    prisma.lancamentoDiario.findMany({
      where: { data: { gte: inicio, lt: fimComVirada } },
      orderBy: { data: 'asc' },
    }),
    vigenciasFloat(),
  ])

  const doMes = lancamentos.filter((l) => l.data < fim)

  if (doMes.length === 0) {
    return {
      periodo, temDados: false, diasLancados: 0,
      tpv: null, receitaTarifaria: null, qtdTransacoes: null, qtdMed: null,
      saldoMedio: null, float: null, takeRate: null, percentMed: null,
    }
  }

  const tpv = doMes.reduce((a, l) => a + l.tpv, 0)
  const receitaTarifaria = doMes.reduce((a, l) => a + l.receitaTarifaria, 0)
  const qtdTransacoes = doMes.reduce((a, l) => a + l.qtdTransacoes, 0)
  const qtdMed = doMes.reduce((a, l) => a + l.qtdMed, 0)
  const saldoMedio = doMes.reduce((a, l) => a + l.saldoEmConta, 0) / doMes.length

  // Inclui a virada do último dia do mês para a primeira madrugada do seguinte.
  const saldos: SaldoDia[] = lancamentos.map((l) => ({ data: l.data, saldoEmConta: l.saldoEmConta }))

  return {
    periodo,
    temDados: true,
    diasLancados: doMes.length,
    tpv,
    receitaTarifaria,
    qtdTransacoes,
    qtdMed,
    saldoMedio,
    float: calcularFloat(saldos, vigencias),
    takeRate: tpv > 0 ? (receitaTarifaria / tpv) * 100 : null,
    percentMed: qtdTransacoes > 0 ? (qtdMed / qtdTransacoes) * 100 : null,
  }
}

export interface LinhasReceita {
  tarifario: number
  float: number
  sustentacao: number
  setup: number
  servicos: number
  total: number
}

/**
 * As cinco linhas de receita do Conselho. Cada uma tem origem única, e a soma
 * é o faturamento do período — não há nenhuma linha lançada em dois lugares.
 */
export async function linhasReceita(periodo: string): Promise<LinhasReceita | null> {
  const { inicio, fim } = intervaloMes(periodo)
  const kpis = await kpisDoPeriodo(periodo)

  const [mrrAgg, contas] = await Promise.all([
    prisma.cliente.aggregate({
      where: { status: 'ATIVO' },
      _sum: { mensalidadeApi: true, sustentacaoWhiteLabel: true },
    }),
    prisma.contaReceber.groupBy({
      by: ['tipo'],
      where: { status: 'PAGO', dataVenc: { gte: inicio, lt: fim } },
      _sum: { valor: true },
    }),
  ])

  const porTipo = (t: string) => contas.find((c) => c.tipo === t)?._sum.valor ?? 0

  const tarifario = kpis.receitaTarifaria ?? 0
  const flt = kpis.float ?? 0
  const sustentacao = (mrrAgg._sum.mensalidadeApi ?? 0) + (mrrAgg._sum.sustentacaoWhiteLabel ?? 0)
  const setup = porTipo('SETUP')
  const servicos = porTipo('OUTROS')
  const total = tarifario + flt + sustentacao + setup + servicos

  if (!kpis.temDados && total === 0) return null

  return { tarifario, float: flt, sustentacao, setup, servicos, total }
}

export interface ContagensClientes {
  contasAtivas: number
  wlAtivos: number
  baasAtivos: number
  apiAtivos: number
  mrr: number
}

/**
 * Contagens derivadas de Cliente — sem tabela nova.
 * "Conta ativa" = cliente com status ATIVO (contrato vigente).
 */
export async function contagensClientes(): Promise<ContagensClientes> {
  const [porModelo, mrrAgg] = await Promise.all([
    prisma.cliente.groupBy({ by: ['modeloOperacional'], where: { status: 'ATIVO' }, _count: true }),
    prisma.cliente.aggregate({
      where: { status: 'ATIVO' },
      _sum: { mensalidadeApi: true, sustentacaoWhiteLabel: true },
    }),
  ])

  const conta = (m: string) => porModelo.find((p) => p.modeloOperacional === m)?._count ?? 0

  return {
    contasAtivas: porModelo.reduce((a, p) => a + p._count, 0),
    apiAtivos: conta('API'),
    wlAtivos: conta('WHITE_LABEL'),
    baasAtivos: conta('BAAS'),
    mrr: (mrrAgg._sum.mensalidadeApi ?? 0) + (mrrAgg._sum.sustentacaoWhiteLabel ?? 0),
  }
}

export interface MetaVsRealizado {
  tipo: string
  meta: number
  realizado: number | null
  atingimento: number | null
}

/** Meta × Realizado. A meta vem de Meta; o realizado, sempre do lançamento diário. */
export async function metasDoPeriodo(periodo: string): Promise<MetaVsRealizado[]> {
  const [metas, kpis] = await Promise.all([
    prisma.meta.findMany({ where: { periodo }, orderBy: { tipo: 'asc' } }),
    kpisDoPeriodo(periodo),
  ])

  const realizadoDe: Record<string, number | null> = {
    RECEITA_TARIFARIA: kpis.receitaTarifaria,
    TPV: kpis.tpv,
    SALDO_EM_CONTA: kpis.saldoMedio,
    TRANSACOES: kpis.qtdTransacoes,
    MEDS: kpis.qtdMed,
  }

  return metas.map((m) => {
    const realizado = realizadoDe[m.tipo] ?? null
    return {
      tipo: m.tipo,
      meta: m.valor,
      realizado,
      atingimento: realizado !== null && m.valor > 0 ? (realizado / m.valor) * 100 : null,
    }
  })
}

export type StatusVolumetria = 'ATINGIDO' | 'NAO_ATINGIDO' | 'EM_ACOMPANHAMENTO' | 'SEM_DADOS'

export interface VolumetriaPeriodo {
  periodo: string
  qtdMinima: number
  realizado: number | null
  diferenca: number | null
  status: StatusVolumetria
}

/**
 * Volumetria mínima GERAL do período. O realizado vem do lançamento diário.
 * Meses ainda em curso ficam EM_ACOMPANHAMENTO até fecharem.
 */
export async function volumetriaDoPeriodo(periodo: string): Promise<VolumetriaPeriodo | null> {
  const [contrato, kpis] = await Promise.all([
    prisma.volumetriaMinima.findUnique({ where: { periodo } }),
    kpisDoPeriodo(periodo),
  ])
  if (!contrato) return null

  const realizado = kpis.qtdTransacoes
  const emCurso = periodo === periodoAtual()

  let status: StatusVolumetria
  if (realizado === null) status = 'SEM_DADOS'
  else if (realizado >= contrato.qtdMinima) status = 'ATINGIDO'
  else if (emCurso) status = 'EM_ACOMPANHAMENTO'
  else status = 'NAO_ATINGIDO'

  return {
    periodo,
    qtdMinima: contrato.qtdMinima,
    realizado,
    diferenca: realizado === null ? null : realizado - contrato.qtdMinima,
    status,
  }
}
