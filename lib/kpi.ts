/**
 * REGISTRO DE KPIs — cada indicador tem UMA fonte oficial.
 *
 *   LancamentoDiario     → TPV, Receita Tarifária, Saldo em Conta, Transações,
 *                          MEDs e Clientes Ativos
 *   FloatConfig          → multiplicador do Float (derivado, nunca lançado)
 *   CondicaoComercial    → MRR, BaaS ativos, White Labels ativos e a
 *                          sustentação usada quando nada foi lançado
 *   LancamentoFinanceiro → Float, Setup e Sustentação lançados (pela natureza
 *                          da categoria), que têm precedência sobre o derivado
 *   Meta                 → objetivos (somente o alvo; o realizado nunca vem daqui)
 *
 * Regra que substitui os 36 fallbacks anteriores: quando não há dado, o valor é
 * `null` e a tela mostra estado vazio. Zero é usado apenas quando é o resultado
 * matemático correto. Nenhum indicador troca de origem silenciosamente.
 */

import { prisma } from '@/lib/prisma'
import { calcularFloat, type SaldoDia, type VigenciaMultiplicador } from '@/lib/float'
import { minimoContratadoDoPeriodo } from '@/lib/volumetria'
import {
  calcularMrr, contagensParceiros, receitaPorNatureza, sustentacaoVigente,
  type Mrr, type ContagensParceiros,
} from '@/lib/financeiro'
import { avaliarMeta, type Avaliacao, type MetaDirecao, type MetaUnidade } from '@/lib/metas'
import { intervaloMes, periodoAtual, ultimosPeriodos } from '@/lib/periodo'

// Reexportados porque muitas telas já os importavam daqui. A implementação
// mora em lib/periodo.ts, para que lib/financeiro.ts possa usá-la sem ciclo.
export { intervaloMes, periodoAtual, ultimosPeriodos }

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
  /**
   * Clientes ativos do mês. É FOTOGRAFIA: o valor do último dia lançado que
   * informou o número, nunca a soma dos dias. null quando nenhum dia do mês
   * informou.
   */
  clientesAtivos: number | null
}

/**
 * Clientes ativos do mês a partir dos lançamentos do período.
 *
 * É ESTOQUE, não fluxo: vale o valor do último dia que informou o número.
 * Somar os dias contaria o mesmo cliente uma vez por dia; pegar o primeiro
 * ignoraria o que aconteceu no mês. Dias sem informação são pulados, e a
 * ausência total devolve null — nunca zero, que seria "nenhum cliente ativo".
 *
 * Função pura para poder ser exercitada sem banco (mesma razão de
 * `consolidarMinimo` em lib/volumetria.ts).
 */
export function clientesAtivosDoMes(
  dias: Array<{ data: Date; clientesAtivos: number | null }>,
): number | null {
  let escolhido: { data: Date; clientesAtivos: number | null } | null = null
  for (const d of dias) {
    if (d.clientesAtivos === null) continue
    if (!escolhido || d.data.getTime() >= escolhido.data.getTime()) escolhido = d
  }
  return escolhido?.clientesAtivos ?? null
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
      clientesAtivos: null,
    }
  }

  const tpv = doMes.reduce((a, l) => a + l.tpv, 0)
  const receitaTarifaria = doMes.reduce((a, l) => a + l.receitaTarifaria, 0)
  const qtdTransacoes = doMes.reduce((a, l) => a + l.qtdTransacoes, 0)
  const qtdMed = doMes.reduce((a, l) => a + l.qtdMed, 0)
  const saldoMedio = doMes.reduce((a, l) => a + l.saldoEmConta, 0) / doMes.length

  const clientesAtivos = clientesAtivosDoMes(doMes)

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
    clientesAtivos,
  }
}

export interface LinhasReceita {
  tarifario: number
  float: number
  sustentacao: number
  setup: number
  total: number
}

/**
 * As QUATRO linhas de receita. Cada uma tem origem única, e a soma é o
 * faturamento do período — não há nenhuma linha lançada em dois lugares.
 *
 * A vertical "Serviços" saiu da composição e nada entrou no lugar dela. Ela
 * vinha de `ContaReceber.tipo = 'OUTROS'`, que é um balde por definição: não
 * dava para dizer que receita era aquela. Os títulos com esse tipo continuam
 * existindo em Contas a Receber; só não formam mais uma vertical de receita.
 *
 * FLOAT, SETUP E SUSTENTAÇÃO: a CATEGORIA do lançamento financeiro é a fonte
 * de verdade. Quando existe lançamento real de uma dessas naturezas no
 * período, é o valor LANÇADO que entra. Quando não existe, entra o valor
 * DERIVADO — sustentação vigente das condições comerciais (a mesma parcela do
 * MRR) e Float calculado do saldo em conta. Nunca os dois: é exatamente aí
 * que a dupla contagem apareceria.
 *
 * Setup não tem derivação: ou foi lançado, ou é zero.
 */
export async function linhasReceita(periodo: string): Promise<LinhasReceita | null> {
  const referencia = new Date(intervaloMes(periodo).fim.getTime() - 1)
  const [kpis, lancado, parceiros] = await Promise.all([
    kpisDoPeriodo(periodo),
    receitaPorNatureza(periodo),
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: { sustentacao: true, sustentacaoInicio: true },
    }),
  ])

  const sustentacaoCadastro = parceiros.reduce(
    (a, p) => a + (sustentacaoVigente(p.sustentacaoInicio, referencia) ? (p.sustentacao ?? 0) : 0),
    0,
  )

  const tarifario = kpis.receitaTarifaria ?? 0
  const flt = lancado.FLOAT > 0 ? lancado.FLOAT : (kpis.float ?? 0)
  const sustentacao = lancado.SUSTENTACAO > 0 ? lancado.SUSTENTACAO : sustentacaoCadastro
  const setup = lancado.SETUP
  const total = tarifario + flt + sustentacao + setup

  if (!kpis.temDados && total === 0) return null

  return { tarifario, float: flt, sustentacao, setup, total }
}

export interface IndicadoresEstrutura {
  /**
   * Clientes ativos do mês — vem do LANÇAMENTO DIÁRIO, não de contagem de
   * linhas de Cliente. É o número que a operação lança, e é o mesmo no Cockpit
   * e no Conselho. null quando o mês não teve nenhum dia informando.
   */
  clientesAtivos: number | null
  /** BaaS ativos — Condições Comerciais BaaS, tipo BAAS. */
  baasAtivos: number
  /** White Labels ativos — Condições Comerciais BaaS, tipo WHITE_LABEL. */
  whiteLabelsAtivos: number
  /** MRR aberto nas quatro parcelas. Mesma função que o Financeiro usa. */
  mrr: Mrr
}

/**
 * Os indicadores de estrutura do negócio, com UMA fonte cada.
 *
 * Antes os três saíam de contagem sobre `Cliente` (status ATIVO agrupado por
 * modeloOperacional). Não servia: um BaaS parceiro não é necessariamente um
 * registro na carteira, e o número de clientes ativos que a operação reporta
 * não é o número de linhas cadastradas. Agora cada um vem de onde é lançado.
 *
 * Cockpit, Conselho e Financeiro chamam esta função — não existe uma segunda
 * consulta equivalente em nenhum deles.
 */
export async function indicadoresEstrutura(periodo: string): Promise<IndicadoresEstrutura> {
  const [kpis, parceiros, mrr] = await Promise.all([
    kpisDoPeriodo(periodo),
    contagensParceiros(),
    calcularMrr(periodo),
  ])

  return {
    clientesAtivos: kpis.clientesAtivos,
    baasAtivos: parceiros.baasAtivos,
    whiteLabelsAtivos: parceiros.whiteLabelsAtivos,
    mrr,
  }
}

export type { ContagensParceiros }

export interface MetaVsRealizado extends Avaliacao {
  tipo: string
  meta: number
  realizado: number | null
  direcao: MetaDirecao
  unidade: MetaUnidade
  /** Percentual de cumprimento. Mantém o nome que as telas já usavam. */
  atingimento: number | null
}

/**
 * De onde sai o REALIZADO de cada tipo de meta. Sempre do lançamento diário —
 * nunca do próprio registro de Meta, que guarda só o alvo.
 *
 * Exportada porque a API de metas precisa saber quais tipos têm realizado
 * apurável, e ter uma segunda cópia da lista lá é como as duas divergem.
 */
export function realizadoPorTipo(kpis: KpisPeriodo): Record<string, number | null> {
  return {
    RECEITA_TARIFARIA: kpis.receitaTarifaria,
    TPV: kpis.tpv,
    SALDO_EM_CONTA: kpis.saldoMedio,
    TRANSACOES: kpis.qtdTransacoes,
    MEDS: kpis.qtdMed,
    MED_PERCENTUAL: kpis.percentMed,
    TAKE_RATE: kpis.takeRate,
  }
}

/**
 * Meta × Realizado. A meta vem de Meta; o realizado, sempre do lançamento
 * diário. A comparação respeita a DIREÇÃO gravada na meta: uma meta de MED em
 * 2% é atingida quando o realizado fica abaixo dela (ver lib/metas.ts).
 */
export async function metasDoPeriodo(periodo: string): Promise<MetaVsRealizado[]> {
  const [metas, kpis] = await Promise.all([
    prisma.meta.findMany({ where: { periodo }, orderBy: { tipo: 'asc' } }),
    kpisDoPeriodo(periodo),
  ])

  const realizadoDe = realizadoPorTipo(kpis)

  return metas.map((m) => {
    const realizado = realizadoDe[m.tipo] ?? null
    const avaliacao = avaliarMeta(m.valor, realizado, m.direcao)
    return {
      tipo: m.tipo,
      meta: m.valor,
      realizado,
      direcao: m.direcao,
      unidade: m.unidade,
      atingimento: avaliacao.cumprimento,
      ...avaliacao,
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
  /** Soma dos contratos por cliente, ou contrato geral legado (meses antigos). */
  origem: 'CLIENTES' | 'GERAL_LEGADO'
  /** Quantos clientes compõem o mínimo. Zero quando a origem é o legado. */
  clientes: number
}

/**
 * Volumetria mínima CONSOLIDADA do período.
 *
 * O mínimo é a soma das exigências contratuais dos clientes vigentes no mês
 * (ver lib/volumetria.ts). O realizado continua vindo do lançamento diário,
 * que é global — não existe transação por cliente, por decisão de produto.
 * Meses ainda em curso ficam EM_ACOMPANHAMENTO até fecharem.
 */
export async function volumetriaDoPeriodo(periodo: string): Promise<VolumetriaPeriodo | null> {
  const [contrato, kpis] = await Promise.all([
    minimoContratadoDoPeriodo(periodo),
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
    origem: contrato.origem,
    clientes: contrato.clientes,
  }
}
