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
  calcularMrr, contagensParceiros, evolucaoParceiros, receitaPorNatureza,
  sustentacaoVigente,
  type Mrr, type ContagensParceiros,
} from '@/lib/financeiro'
import {
  avaliarMeta, ehMetaDePipeline,
  type Avaliacao, type MetaDirecao, type MetaUnidade,
} from '@/lib/metas'
import {
  intervaloMes, intervaloParcial, janelaComparavel, periodoAtual,
  periodoEmCurso, ultimosPeriodos, diaDoMes, diasNoMes,
} from '@/lib/periodo'

// Reexportados porque muitas telas já os importavam daqui. A implementação
// mora em lib/periodo.ts, para que lib/financeiro.ts possa usá-la sem ciclo.
export {
  intervaloMes, intervaloParcial, janelaComparavel, periodoAtual,
  periodoEmCurso, ultimosPeriodos, diaDoMes, diasNoMes,
}

export interface KpisPeriodo {
  periodo: string
  /** Falso quando não há nenhum lançamento no período — a tela mostra vazio. */
  temDados: boolean
  diasLancados: number
  /**
   * Até que dia do mês esta apuração foi: `null` = mês inteiro.
   *
   * Existe para que a tela possa DECLARAR a janela em vez de o leitor supor.
   * Sem isto, "R$ 10 mi" no dia 7 e "R$ 10 mi" no dia 30 são indistinguíveis
   * — e é exatamente essa ambiguidade que tornava a variação mensal enganosa.
   */
  ateDia: number | null
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
 * O Float precisa do dia seguinte ao fim da janela para saber o que dormiu na
 * virada, por isso a consulta busca um dia a mais e depois recorta.
 *
 * ── `ateDia`: A JANELA PARCIAL ──────────────────────────────────────────
 *
 * Trunca a apuração no dia informado (inclusivo), para que o mês corrente
 * possa ser comparado com a MESMA janela do mês anterior. Ausente = mês
 * inteiro, que é o comportamento de sempre e o de todo período fechado.
 *
 * É aqui que o truncamento acontece, e não na tela, por uma razão: todos os
 * KPIs derivam dos mesmos lançamentos, e recortar o conjunto na origem mantém
 * TPV, receita, transações, MED, saldo médio e Float coerentes entre si. Cada
 * tela cortando o seu número produziria indicadores que não fecham — o saldo
 * médio de 7 dias com o TPV de 30, por exemplo.
 *
 * Ver `lib/periodo.ts` para por que a janela é de dias de CALENDÁRIO.
 */
export async function kpisDoPeriodo(
  periodo: string, ateDia?: number | null,
): Promise<KpisPeriodo> {
  const { inicio, fim } = intervaloParcial(periodo, ateDia)
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
      ateDia: ateDia ?? null,
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
    ateDia: ateDia ?? null,
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

/* ========================================================================= *
 * COMPARAÇÃO MENSAL EQUIVALENTE — a correção das setas
 *
 * ── O DEFEITO ───────────────────────────────────────────────────────────
 *
 * O Cockpit e o Conselho comparavam o acumulado PARCIAL do mês corrente com o
 * mês anterior INTEIRO. No dia 7, R$ 10 mi de 7 dias eram medidos contra R$ 40
 * mi de 30 dias, e a seta saía vermelha com −75%.
 *
 * Isso não era um KPI ruim: era um KPI errado. Todo começo de mês, todos os
 * indicadores ficavam negativos, independentemente do desempenho — e um
 * indicador que é negativo por construção não informa nada.
 *
 * ── A CORREÇÃO ──────────────────────────────────────────────────────────
 *
 * Quando o período de referência está EM CURSO, os dois lados usam a MESMA
 * janela de dias de calendário:
 *
 *   dia 07  →  01–07 do mês atual   vs   01–07 do mês anterior
 *   dia 15  →  01–15 do mês atual   vs   01–15 do mês anterior
 *
 * Quando o período está FECHADO, os dois meses são comparados INTEIROS — não
 * há o que truncar, e truncar jogaria fora dado real.
 *
 * ── POR QUE UMA FUNÇÃO SÓ ───────────────────────────────────────────────
 *
 * Cockpit, Conselho e qualquer outra tela que mostre variação mensal chamam
 * ESTA função. Cada tela escolhendo a sua base comparável é como as duas
 * passam a discordar — e já aconteceu neste produto, com o `anterior` sendo
 * calculado por um `find` repetido em dois arquivos.
 *
 * APLICA-SE SÓ A KPI MENSAL/PERIÓDICO. Indicadores com outra lógica temporal
 * correta — o pacing de Metas, que já compara contra o tempo decorrido, ou a
 * série diária do gráfico operacional — não passam por aqui.
 * ========================================================================= */

export interface ComparacaoMensal {
  /** O período de referência, apurado na janela (parcial se em curso). */
  atual: KpisPeriodo
  /**
   * O período anterior COM DADO, apurado na MESMA janela. `null` quando não
   * existe nenhum mês anterior com lançamento — e aí nenhuma variação é
   * exibida, em vez de uma variação contra zero.
   */
  anterior: KpisPeriodo | null
  /** A janela usada nos dois lados: `null` = meses inteiros. */
  ateDia: number | null
  /** O período em curso? Decide se a tela declara "até o dia N". */
  emCurso: boolean
}

/**
 * Rótulo da janela, para a tela DECLARAR o que está comparando.
 *
 * Sem ele, "+33,3%" é um número sem referência — e foi a ausência dessa
 * referência que deixou a comparação errada passar tanto tempo invisível.
 */
export function rotuloComparacao(c: ComparacaoMensal): string {
  if (!c.anterior) return 'sem mês anterior com dado'
  if (c.ateDia === null) return 'vs mês anterior'
  const dia = String(c.ateDia).padStart(2, '0')
  return `01–${dia} vs 01–${dia} do mês anterior`
}

/**
 * A comparação mensal equivalente de um período.
 *
 * `serie` são os KPIs já apurados dos meses anteriores, do mais antigo ao mais
 * recente, INCLUINDO o período de referência no fim — é o formato que o
 * Cockpit e o Conselho já montam para as sparklines, e reaproveitá-lo evita
 * N consultas só para descobrir qual foi o último mês com dado.
 *
 * O mês comparável é o último ANTERIOR COM DADO, não necessariamente o
 * imediatamente anterior: um mês sem nenhum lançamento compararia contra zero,
 * o que `variacao` já recusa — mas pular para o mês anterior com dado dá uma
 * base honesta em vez de nenhuma.
 *
 * REAPURA o mês comparável na janela parcial. É uma consulta a mais, e é
 * inevitável: a série vem com os meses INTEIROS (é o que a sparkline precisa),
 * e usar o valor inteiro como base é precisamente o defeito.
 */
export async function comparacaoMensal(
  periodo: string, serie: KpisPeriodo[], hoje: Date = new Date(),
): Promise<ComparacaoMensal> {
  const ateDia = janelaComparavel(periodo, hoje)
  const emCurso = periodoEmCurso(periodo, hoje)

  const atual = await kpisDoPeriodo(periodo, ateDia)

  // O último mês anterior COM DADO. A série inclui o período de referência no
  // fim, então ele é descartado antes da busca.
  const anteriorInteiro = [...serie]
    .filter((k) => k.periodo !== periodo)
    .reverse()
    .find((k) => k.temDados) ?? null

  if (!anteriorInteiro) return { atual, anterior: null, ateDia, emCurso }

  // Mês inteiro de um lado e janela parcial do outro é o defeito. Quando há
  // janela, o comparável é REAPURADO nela.
  const anterior = ateDia === null
    ? anteriorInteiro
    : await kpisDoPeriodo(anteriorInteiro.periodo, ateDia)

  return { atual, anterior, ateDia, emCurso }
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

/* ========================================================================= *
 * COMPOSIÇÃO DE RECEITA DO CONSELHO — os seis tipos oficiais
 * ========================================================================= */

export const TIPOS_RECEITA_CONSELHO = [
  'TRANSACIONAL', 'SETUP', 'MENSALIDADES', 'SUSTENTACAO', 'SERVICOS', 'BAAS',
] as const
export type TipoReceitaConselho = typeof TIPOS_RECEITA_CONSELHO[number]

export const TIPO_RECEITA_LABEL: Record<TipoReceitaConselho, string> = {
  TRANSACIONAL: 'Transacional',
  SETUP: 'Setup',
  MENSALIDADES: 'Mensalidades',
  SUSTENTACAO: 'Sustentação',
  SERVICOS: 'Serviços',
  BAAS: 'BaaS',
}

/**
 * Os tipos que SOMAM no total da receita realizada.
 *
 * MENSALIDADES fica fora: ela já está embutida na tarifa transacional (é como
 * a Bass Pago cobra hoje), e somá-la contaria o mesmo dinheiro duas vezes. A
 * linha continua aparecendo como indicador de recorrência.
 *
 * FLOAT entra: é receita realizada e não está dentro de nenhuma outra linha.
 */
export const TIPOS_QUE_SOMAM: readonly TipoReceitaConselho[] = [
  'TRANSACIONAL', 'SETUP', 'SUSTENTACAO', 'SERVICOS', 'BAAS',
]

export function somaNoTotal(tipo: TipoReceitaConselho): boolean {
  return TIPOS_QUE_SOMAM.includes(tipo)
}

export interface ComposicaoReceita {
  linhas: Array<{
    tipo: TipoReceitaConselho
    label: string
    valor: number
    /**
     * A linha entra no total? `false` só em MENSALIDADES, que já está dentro
     * da tarifa transacional. A tela precisa saber para não somar à mão e
     * para poder dizer ao leitor por que a soma não fecha com as linhas.
     */
    soma: boolean
  }>
  /** Soma apenas dos tipos que somam — nunca inclui Mensalidades. */
  total: number
  /**
   * Mensalidades de API, como INDICADOR de recorrência.
   *
   * Fora do total de propósito. É a mesma parcela que compõe o MRR, e já está
   * embutida na receita tarifária: somá-la aqui duplicaria o dinheiro.
   */
  mensalidadesIndicador: number
}

/**
 * A composição de receita como o Conselho a lê.
 *
 * TRANSACIONAL É A TARIFÁRIA. Não são duas linhas: é a mesma receita com o
 * nome que o Conselho usa. Mostrar "Tarifária" ao lado de "Transacional"
 * duplicaria o mesmo dinheiro na composição.
 *
 * ── A REGRA QUE ESTA FUNÇÃO EXISTE PARA CUMPRIR ─────────────────────────
 *
 * AS MENSALIDADES DE API JÁ ESTÃO DENTRO DA TARIFA TRANSACIONAL. É assim que
 * a Bass Pago cobra hoje: a mensalidade é apurada junto com o transacional, e
 * o que chega ao Lançamento Diário como `receitaTarifaria` já a contém.
 *
 * Por isso a linha "Mensalidades" é um INDICADOR, e NÃO é somada ao total:
 * somá-la contaria o mesmo dinheiro duas vezes. O número aparece porque a
 * recorrência precisa ser visível — é a base do MRR —, mas entra marcado como
 * fora da soma.
 *
 * Omitir a linha seria pior: o executivo pergunta quanto é recorrente, e a
 * resposta não estaria em lugar nenhum da composição.
 *
 * ── A PARTIÇÃO ──────────────────────────────────────────────────────────
 *
 * Cada real dos LANÇAMENTOS entra em exatamente uma linha. A regra, aplicada
 * em ordem sobre os lançamentos de receita do período:
 *
 *   1. categoria com natureza SETUP        → Setup
 *   2. categoria com natureza SUSTENTACAO  → Sustentação
 *   3. categoria com natureza FLOAT        → Float
 *   4. vinculado a uma condição BaaS       → BaaS
 *   5. o que sobra                         → Serviços
 *
 * O vínculo com o parceiro só classifica DEPOIS da natureza: um setup cobrado
 * de um BaaS é setup, não "receita de BaaS". Sem essa ordem, a mesma linha
 * contaria nas duas.
 *
 * TRANSACIONAL vem de fonte própria — o Lançamento Diário, que é a fonte
 * oficial de `receitaTarifaria`.
 *
 * SUSTENTAÇÃO tem derivação: sem lançamento no período, entra a sustentação
 * vigente das condições. Nunca as duas, que é onde a dupla contagem apareceria.
 */
export async function composicaoReceitaConselho(periodo: string): Promise<ComposicaoReceita> {
  const { inicio, fim } = intervaloMes(periodo)
  const referencia = new Date(fim.getTime() - 1)

  const [kpis, mrr, parceiros, lancamentos] = await Promise.all([
    kpisDoPeriodo(periodo),
    calcularMrr(periodo),
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: { id: true, tipo: true, sustentacao: true, sustentacaoInicio: true },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: {
        tipo: 'RECEITA',
        data: { gte: inicio, lt: fim },
        status: { not: 'CANCELADO' },
      },
      select: {
        valor: true, condicaoId: true,
        categoria: { select: { natureza: true } },
      },
    }),
  ])

  const tipoDaCondicao = new Map(parceiros.map((p) => [p.id, p.tipo]))

  let setup = 0
  let sustentacaoLancada = 0
  let baas = 0
  let servicos = 0
  let floatLancado = 0

  for (const l of lancamentos) {
    const n = l.categoria.natureza
    if (n === 'SETUP') { setup += l.valor; continue }
    if (n === 'SUSTENTACAO') { sustentacaoLancada += l.valor; continue }
    if (n === 'FLOAT') { floatLancado += l.valor; continue }
    if (l.condicaoId && tipoDaCondicao.get(l.condicaoId) === 'BAAS') { baas += l.valor; continue }
    servicos += l.valor
  }

  const sustentacaoCadastro = parceiros.reduce(
    (a, p) => a + (sustentacaoVigente(p.sustentacaoInicio, referencia) ? (p.sustentacao ?? 0) : 0),
    0,
  )

  const mensalidades = mrr.apiMensalParceiros + mrr.apiMensalCarteira

  const valores: Record<TipoReceitaConselho, number> = {
    TRANSACIONAL: kpis.receitaTarifaria ?? 0,
    SETUP: setup,
    // INDICADOR, não parcela: já está embutida no transacional acima.
    MENSALIDADES: mensalidades,
    SUSTENTACAO: sustentacaoLancada > 0 ? sustentacaoLancada : sustentacaoCadastro,
    // Serviços recebe o Float junto: as duas são receita realizada que não
    // pertence a nenhuma das outras linhas, e o Conselho tem seis tipos —
    // criar um sétimo para o Float contrariaria a lista oficial.
    SERVICOS: servicos + floatLancado,
    BAAS: baas,
  }

  const linhas = TIPOS_RECEITA_CONSELHO.map((t) => ({
    tipo: t,
    label: TIPO_RECEITA_LABEL[t],
    valor: valores[t],
    soma: somaNoTotal(t),
  }))

  return {
    linhas,
    // Só o que soma. Mensalidades fica de fora para não contar duas vezes.
    total: linhas.filter((l) => l.soma).reduce((a, l) => a + l.valor, 0),
    mensalidadesIndicador: mensalidades,
  }
}

export interface IndicadoresEstrutura {
  /**
   * Clientes ativos do mês — vem do LANÇAMENTO DIÁRIO, não de contagem de
   * linhas de Cliente. É o número que a operação lança, e é o mesmo no Cockpit
   * e no Conselho. null quando o mês não teve nenhum dia informando.
   */
  clientesAtivos: number | null
  /** BaaS ativos — Condições BaaS, tipo BAAS. */
  baasAtivos: number
  /** White Labels ativos — Condições BaaS, tipo WHITE_LABEL. */
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
export function realizadoPorTipo(
  kpis: KpisPeriodo, unidade: MetaUnidade = 'VALOR',
): Record<string, number | null> {
  return {
    RECEITA_TARIFARIA: kpis.receitaTarifaria,
    TPV: kpis.tpv,
    SALDO_EM_CONTA: kpis.saldoMedio,
    TRANSACOES: kpis.qtdTransacoes,
    /**
     * MED É UM INDICADOR SÓ: a UNIDADE da meta é que decide se o realizado é a
     * quantidade de MEDs ou a proporção delas sobre as transações. Sem isso,
     * uma meta de "MED 2%" seria comparada contra 31.664 MEDs.
     */
    MEDS: unidade === 'PERCENTUAL' ? kpis.percentMed : kpis.qtdMed,
    /** Legado: metas antigas gravadas antes de MED virar um indicador só. */
    MED_PERCENTUAL: kpis.percentMed,
    TAKE_RATE: kpis.takeRate,
  }
}

/* ========================================================================= *
 * OBSERVAÇÕES DIÁRIAS — SAIU
 *
 * `ObservacaoDiaria`, `observacoesDiarias` e `atividadeOperacionalDiaria`
 * foram removidas nesta rodada, junto com o gráfico que eram as únicas a
 * servir.
 *
 * Elas recortavam a série por QUANTIDADE DE DIAS LANÇADOS (`slice(-90)`) sobre
 * uma janela de PERÍODOS MENSAIS. Com o filtro de 7/30/90 dias, a janela
 * passou a ser de calendário e com piso em 01/10 — duas regras diferentes para
 * a mesma série, e é assim que dois gráficos do mesmo dado passam a discordar.
 *
 * Quem produz a série diária agora é `serieDiaria`, logo abaixo, e ela é a
 * única: os nove gráficos de resolução diária leem dela.
 * ========================================================================= */

/* ========================================================================= *
 * SÉRIES DO COCKPIT — a janela de 7, 30 e 90 dias
 *
 * ── A DATA MÍNIMA ───────────────────────────────────────────────────────
 *
 * A "Evolução Atividade Operacional Diária" — e, com ela, toda série de
 * resolução DIÁRIA do Cockpit — começa em 01/10/2026. Antes dessa data o
 * lançamento diário não era a fonte confiável que é hoje, e o pedido é
 * explícito: não exibir dado anterior e não inventar nada para preencher.
 *
 * É uma CONSTANTE, não uma data móvel. "O dia 1º de outubro mais recente"
 * pareceria mais esperto e seria errado: em novembro de 2027 o piso saltaria
 * para 01/10/2027 e apagaria um ano de operação real. O piso marca quando a
 * base passou a valer — um fato do passado, que não se move.
 *
 * CONSEQUÊNCIA VISÍVEL, e ela é correta: enquanto houver menos de 90 dias
 * desde o piso, as três janelas devolvem o mesmo recorte. A tela DECLARA isso
 * (`limitada`) em vez de deixar o leitor concluir que 30 e 90 dias são a
 * mesma coisa.
 *
 * ── POR QUE A JANELA É DE CALENDÁRIO ────────────────────────────────────
 *
 * "Últimos 30 dias" é um intervalo de datas, não "os últimos 30 registros".
 * A versão anterior cortava por quantidade de dias LANÇADOS (`slice(-dias)`),
 * e isso fazia a janela esticar no tempo conforme os fins de semana sem
 * operação — "30 dias" podia cobrir seis semanas de calendário. Dias sem
 * lançamento continuam FORA da série (não viram zero), mas não alongam mais a
 * janela.
 * ========================================================================= */

/**
 * O PISO da série diária do Cockpit: 01/10/2026.
 *
 * Exportado para que a tela possa declará-lo e os testes possam prendê-lo.
 */
export const DATA_MINIMA_ATIVIDADE = new Date(Date.UTC(2026, 9, 1))

/** As três janelas que o Cockpit oferece. Conjunto FECHADO. */
export const RANGES_DIAS = [7, 30, 90] as const
export type RangeDias = typeof RANGES_DIAS[number]

export const RANGE_PADRAO: RangeDias = 30

/**
 * Interpreta `range=7d|30d|90d` (ou "7", "30", "90") da query string.
 *
 * Devolve `null` para qualquer outra coisa — e quem chama cai no padrão em vez
 * de aceitar uma janela arbitrária. Sem o conjunto fechado, `range=100000d`
 * varreria a tabela inteira a pedido de quem montasse a URL.
 */
export function rangeDias(valor: string | null | undefined): RangeDias | null {
  if (!valor) return null
  const n = Number(String(valor).replace(/d$/i, ''))
  return (RANGES_DIAS as readonly number[]).includes(n) ? (n as RangeDias) : null
}

const DIA_MS = 86_400_000

/** Meia-noite UTC do dia da data. O grão das colunas DATE. */
function meiaNoiteUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export interface JanelaDiaria {
  /** Primeiro dia da janela, inclusivo. Nunca antes de `DATA_MINIMA_ATIVIDADE`. */
  inicio: Date
  /** Limite superior EXCLUSIVO: o dia seguinte a hoje. */
  fim: Date
  /** Dias de calendário que a janela de fato cobre. */
  dias: number
  /** A janela pedida foi ENCURTADA pelo piso de 01/10? */
  limitada: boolean
  /** Quantos dias foram pedidos. Para a tela poder dizer o que cortou. */
  pedidos: RangeDias
}

/**
 * A janela de N dias terminando HOJE, respeitando o piso.
 *
 * `hoje` é parâmetro para a função ser determinística nos testes — a mesma
 * razão de `calcularPacing` receber a data.
 */
export function janelaDiaria(
  dias: RangeDias, hoje: Date = new Date(),
): JanelaDiaria {
  const hojeUtc = meiaNoiteUtc(hoje)
  // N dias INCLUINDO hoje: a janela de 7 dias é hoje e os 6 anteriores.
  const desejado = new Date(hojeUtc.getTime() - (dias - 1) * DIA_MS)
  const limitada = desejado.getTime() < DATA_MINIMA_ATIVIDADE.getTime()
  const inicio = limitada ? DATA_MINIMA_ATIVIDADE : desejado
  const fim = new Date(hojeUtc.getTime() + DIA_MS)

  return {
    inicio,
    fim,
    dias: Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / DIA_MS)),
    limitada,
    pedidos: dias,
  }
}

export interface PontoDiario {
  /** "dd/mm" — o rótulo do eixo. O ano está no subtítulo do gráfico. */
  rotulo: string
  /** Data completa, para o tooltip. */
  dia: string
  tpv: number
  receita: number
  transacoes: number
  med: number
  /** MED sobre transações, em pontos percentuais. Null sem transação no dia. */
  medPercentual: number | null
  saldo: number
  /** Fotografia do dia. Null quando o dia não informou. */
  clientesAtivos: number | null
  /** Receita ÷ TPV do dia. Null sem TPV — dividir por zero daria 0%. */
  takeRate: number | null
}

/**
 * A SÉRIE DIÁRIA do Cockpit, na janela escolhida.
 *
 * Uma consulta serve TODOS os gráficos de resolução diária — TPV, receita,
 * transações, MED, saldo, clientes ativos e take rate. Uma consulta por
 * gráfico pagaria sete idas ao banco pelo mesmo conjunto de linhas.
 *
 * Só dias EXISTENTES entram. Dia sem lançamento NÃO vira zero — zero
 * afirmaria que o dia teve movimento nenhum, quando o que houve foi ausência
 * de lançamento. São coisas diferentes, e o gráfico não deve confundi-las.
 */
export async function serieDiaria(
  dias: RangeDias, hoje: Date = new Date(),
): Promise<PontoDiario[]> {
  const j = janelaDiaria(dias, hoje)
  if (j.dias <= 0) return []

  const linhas = await prisma.lancamentoDiario.findMany({
    where: { data: { gte: j.inicio, lt: j.fim } },
    select: {
      data: true, tpv: true, receitaTarifaria: true, qtdTransacoes: true,
      qtdMed: true, saldoEmConta: true, clientesAtivos: true,
    },
    orderBy: { data: 'asc' },
  })

  return linhas.map((d) => ({
    rotulo: d.data.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', timeZone: 'UTC',
    }),
    dia: d.data.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
    tpv: d.tpv,
    receita: d.receitaTarifaria,
    transacoes: d.qtdTransacoes,
    med: d.qtdMed,
    medPercentual: d.qtdTransacoes > 0 ? (d.qtdMed / d.qtdTransacoes) * 100 : null,
    saldo: d.saldoEmConta,
    clientesAtivos: d.clientesAtivos,
    takeRate: d.tpv > 0 ? (d.receitaTarifaria / d.tpv) * 100 : null,
  }))
}

export interface PontoMensalCockpit {
  /** "YYYY-MM". */
  mes: string
  baasAtivos: number
  whiteLabelsAtivos: number
  mrr: number
}

/**
 * A SÉRIE MENSAL do Cockpit, nos meses que a janela TOCA.
 *
 * ── POR QUE TRÊS GRÁFICOS NÃO SÃO DIÁRIOS ───────────────────────────────
 *
 * BaaS ativos, White Labels ativos e MRR não têm resolução diária e não há
 * como inventá-la. "Parceiros ativos" é uma contagem de cadastro, reconstruída
 * do histórico de `ativo` das condições comerciais (ver `evolucaoParceiros`);
 * o MRR é apurado sobre a carteira vigente no fim do mês. Desenhá-los dia a
 * dia produziria 90 pontos idênticos — uma linha reta fingindo tendência, que
 * é exatamente o que o produto já recusa em outros lugares.
 *
 * Então eles respondem ao filtro pela JANELA, com a resolução que têm: os
 * meses que o intervalo escolhido atravessa. 90 dias dão uma leitura
 * trimestral; 7 dias tocam um mês só, e aí o gráfico diz que a série tem
 * resolução mensal em vez de desenhar um ponto solto.
 *
 * O PISO DE 01/10 NÃO SE APLICA AQUI. Ele é uma afirmação sobre quando o
 * LANÇAMENTO DIÁRIO passou a ser confiável; a história das condições
 * comerciais é anterior e continua válida. Aplicá-lo colapsaria estes três
 * gráficos a um único mês sem nenhuma razão de dado.
 */
export async function serieMensalCockpit(
  dias: RangeDias, hoje: Date = new Date(),
): Promise<PontoMensalCockpit[]> {
  const j = janelaDiaria(dias, hoje)

  // Os meses que a janela atravessa, do mais antigo ao mais novo. A janela é
  // de calendário, então basta caminhar de mês em mês entre as duas pontas.
  const meses: string[] = []
  const cursor = new Date(Date.UTC(j.inicio.getUTCFullYear(), j.inicio.getUTCMonth(), 1))
  const ultimo = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))
  while (cursor.getTime() <= ultimo.getTime()) {
    meses.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
    )
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  if (meses.length === 0) return []

  const [parceiros, mrrs] = await Promise.all([
    evolucaoParceiros(meses),
    // O MRR é apurado POR MÊS, e não repetido: `calcularMrr` respeita a data
    // de início da sustentação de cada parceiro, então o valor muda conforme
    // os contratos entram em vigor. Repetir o número de hoje em todos os meses
    // — como a versão anterior fazia — produzia uma linha reta que o gráfico
    // tinha de detectar e recusar.
    Promise.all(meses.map((m) => calcularMrr(m))),
  ])

  return meses.map((m, i) => ({
    mes: m,
    baasAtivos: parceiros[i]?.baasAtivos ?? 0,
    whiteLabelsAtivos: parceiros[i]?.whiteLabelsAtivos ?? 0,
    mrr: mrrs[i]?.total ?? 0,
  }))
}

export interface SeriesCockpit {
  range: RangeDias
  janela: {
    inicio: string
    fim: string
    dias: number
    limitada: boolean
    pedidos: number
    /** O piso, em ISO, para a tela poder citá-lo. */
    minimo: string
  }
  diario: PontoDiario[]
  mensal: PontoMensalCockpit[]
}

/**
 * TUDO o que os gráficos do Cockpit precisam para uma janela, numa chamada.
 *
 * É esta função que a página e a API `/api/dashboard/series` usam — a mesma,
 * para que a primeira renderização (servidor) e a troca de janela (cliente)
 * nunca possam divergir. Duas montagens do mesmo payload é como a tela passa a
 * mostrar um número diferente depois de o usuário clicar em "30 dias".
 */
export async function seriesCockpit(
  dias: RangeDias = RANGE_PADRAO, hoje: Date = new Date(),
): Promise<SeriesCockpit> {
  const j = janelaDiaria(dias, hoje)
  const [diario, mensal] = await Promise.all([
    serieDiaria(dias, hoje),
    serieMensalCockpit(dias, hoje),
  ])

  return {
    range: dias,
    janela: {
      inicio: j.inicio.toISOString().slice(0, 10),
      fim: new Date(j.fim.getTime() - DIA_MS).toISOString().slice(0, 10),
      dias: j.dias,
      limitada: j.limitada,
      pedidos: j.pedidos,
      minimo: DATA_MINIMA_ATIVIDADE.toISOString().slice(0, 10),
    },
    diario,
    mensal,
  }
}

/* ========================================================================= *
 * REALIZADO DAS METAS DE PIPELINE
 * ========================================================================= */

export interface RealizadoPipeline {
  leadsGerados: number
  leadsGanhos: number
  leadsPerdidos: number
  /** Ganhos sobre decididos. Null quando nada foi decidido — nunca 0%. */
  conversao: number | null
  atividadeAssistidaQtd: number
  /** Fração da base de leads em atividade assistida. Null com base vazia. */
  atividadeAssistidaPct: number | null
  /** Base de leads considerada no percentual — a rastreabilidade do número. */
  baseLeads: number
}

/**
 * O realizado das metas de PIPELINE.
 *
 * Fonte: Lead e Deal, os mesmos registros que a Visão geral do Comercial lê.
 * Não há tabela de apuração comercial, e criar uma produziria uma segunda
 * verdade sobre o mesmo card.
 *
 * GANHO E PERDA pelo DESFECHO, não pela etapa: desde a v17 `Deal.resultado` é
 * um eixo próprio, e a data do desfecho é `resultadoEm` (com `closedAt` como
 * retaguarda para os cards anteriores à v17, cujo fechamento só existia ali).
 *
 * ATIVIDADE ASSISTIDA segue a definição de `lib/comercial.ts`: card aberto com
 * responsável, ou tarefa / follow-up em aberto com responsável. Card aberto
 * sem responsável não conta — é exatamente o lead que ninguém está tocando.
 */
export async function realizadoPipeline(periodo: string): Promise<RealizadoPipeline> {
  const { inicio, fim } = intervaloMes(periodo)
  const noPeriodo = { gte: inicio, lt: fim }

  const [gerados, baseLeads, ganhos, perdidos, abertosComDono, clientesAssistidos] =
    await Promise.all([
      prisma.lead.count({ where: { createdAt: noPeriodo } }),
      prisma.lead.count(),
      // CARD EXCLUÍDO FICA FORA DE TODOS OS TRÊS. Um card que saiu do
      // Pipeline não ganhou nem perdeu nada, e não está sendo assistido por
      // ninguém — contá-lo faria o indicador descrever um quadro que não
      // existe mais.
      prisma.deal.count({
        where: {
          resultado: 'GANHO',
          deletedAt: null,
          OR: [{ resultadoEm: noPeriodo }, { resultadoEm: null, closedAt: noPeriodo }],
        },
      }),
      prisma.deal.count({
        where: {
          resultado: 'PERDIDO',
          deletedAt: null,
          OR: [{ resultadoEm: noPeriodo }, { resultadoEm: null, closedAt: noPeriodo }],
        },
      }),
      // Leads DISTINTOS com card aberto e responsável: um lead com dois cards
      // abertos é um lead assistido, não dois.
      prisma.deal.findMany({
        where: { resultado: 'EM_ANDAMENTO', leadId: { not: null }, deletedAt: null },
        select: { leadId: true, clienteId: true },
        distinct: ['leadId'],
      }),
      // Clientes com tarefa ou follow-up em aberto E com responsável.
      clientesComAtividadeAberta(),
    ])

  const assistidos = new Set<string>()
  for (const d of abertosComDono) {
    if (d.leadId) assistidos.add(d.leadId)
  }
  // Um card cujo cliente tem atividade aberta também conta como assistido.
  for (const d of abertosComDono) {
    if (d.leadId && d.clienteId && clientesAssistidos.has(d.clienteId)) assistidos.add(d.leadId)
  }

  const decididos = ganhos + perdidos

  return {
    leadsGerados: gerados,
    leadsGanhos: ganhos,
    leadsPerdidos: perdidos,
    conversao: decididos > 0 ? (ganhos / decididos) * 100 : null,
    atividadeAssistidaQtd: assistidos.size,
    atividadeAssistidaPct: baseLeads > 0 ? (assistidos.size / baseLeads) * 100 : null,
    baseLeads,
  }
}

/**
 * Clientes com tarefa ou follow-up EM ABERTO e com responsável definido.
 *
 * "Em aberto" para tarefa é status PENDENTE ou EM_ANDAMENTO — concluída e
 * cancelada não são acompanhamento. Para follow-up é ter próximo contato
 * agendado, que é o que torna o acompanhamento verificável.
 */
export async function clientesComAtividadeAberta(): Promise<Set<string>> {
  const [tarefas, followUps] = await Promise.all([
    prisma.tarefa.findMany({
      where: { status: { in: ['PENDENTE', 'EM_ANDAMENTO'] }, clienteId: { not: null } },
      select: { clienteId: true },
      distinct: ['clienteId'],
    }),
    prisma.followUp.findMany({
      where: { proximoContato: { not: null }, responsavelId: { not: null } },
      select: { clienteId: true },
      distinct: ['clienteId'],
    }),
  ])

  const s = new Set<string>()
  for (const t of tarefas) if (t.clienteId) s.add(t.clienteId)
  for (const f of followUps) s.add(f.clienteId)
  return s
}

/**
 * O realizado de uma meta de pipeline, conforme a UNIDADE.
 *
 * Mesma regra do MED: o indicador é um só, e a unidade escolhida no cadastro
 * decide se o alvo é "60% da base acompanhada" ou "80 leads acompanhados".
 */
export function realizadoDeMetaPipeline(
  r: RealizadoPipeline, tipo: string, unidade: MetaUnidade,
): number | null {
  switch (tipo) {
    case 'LEADS_GERADOS': return r.leadsGerados
    case 'LEADS_GANHOS': return r.leadsGanhos
    case 'LEADS_PERDIDOS': return r.leadsPerdidos
    case 'CONVERSAO_LEADS': return r.conversao
    case 'ATIVIDADE_ASSISTIDA':
      return unidade === 'PERCENTUAL' ? r.atividadeAssistidaPct : r.atividadeAssistidaQtd
    default: return null
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

  // As metas de pipeline têm outra fonte (Lead e Deal). A consulta só acontece
  // se existir alguma meta desse tipo no período — não se paga por nada.
  const temPipeline = metas.some((m) => ehMetaDePipeline(m.tipo))
  const pipeline = temPipeline ? await realizadoPipeline(periodo) : null

  return metas.map((m) => {
    // O realizado depende da unidade da meta — ver `realizadoPorTipo`.
    const realizado = ehMetaDePipeline(m.tipo)
      ? (pipeline ? realizadoDeMetaPipeline(pipeline, m.tipo, m.unidade) : null)
      : (realizadoPorTipo(kpis, m.unidade)[m.tipo] ?? null)
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
