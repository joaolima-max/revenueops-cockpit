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
  calcularMrr, contagensParceiros, evolucaoParceiros, primeiroMesComParceiros,
  parcelasDoMrr, receitaPorNatureza, receitaLancadaPorLinha,
  realizadoReceitaPrevisao, sustentacaoVigente,
  type Mrr, type ContagensParceiros, type RealizadoReceitaPrevisao,
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
  /**
   * `takeRate` SAIU daqui.
   *
   * Ele era `receitaTarifaria ÷ tpv`, e esta interface só conhece o
   * Lançamento Diário. O take rate passou a depender de três fontes — a
   * tarifa transacional, a apuração dos parceiros e o MRR a descontar —, e
   * calculá-lo aqui obrigaria cada leitor desta interface a ter as outras
   * duas. Ver `baseTakeRate`, que é a fonte única.
   *
   * A série DIÁRIA mantém o seu `takeRate` (ver `PontoDiario`): é a razão
   * tarifa ÷ TPV DO DIA, um indicador operacional de outra granularidade —
   * não existe apuração de parceiro nem mensalidade com resolução diária.
   */
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
      saldoMedio: null, float: null, percentMed: null,
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

  const atualPedido = await kpisDoPeriodo(periodo, ateDia)

  // O último mês anterior COM DADO. A série inclui o período de referência no
  // fim, então ele é descartado antes da busca.
  const anteriorInteiro = [...serie]
    .filter((k) => k.periodo !== periodo)
    .reverse()
    .find((k) => k.temDados) ?? null

  if (!anteriorInteiro) {
    return { atual: atualPedido, anterior: null, ateDia, emCurso }
  }

  /**
   * A JANELA É IGUALADA NOS DOIS LADOS, e isso é mais que reapurar o
   * comparável.
   *
   * No dia 31 de um mês, "os 31 dias decorridos" não existem em fevereiro —
   * `intervaloParcial` capa no fim do mês e devolveria 28. Comparar 31 dias
   * de março com 28 de fevereiro é o MESMO defeito que esta função existe
   * para corrigir, só invertido.
   *
   * Então a janela efetiva é o MENOR dos dois tamanhos, e vale para os dois.
   * É a regra de `parTemporal` (lib/comparacao-temporal), que é o serviço
   * único de comparação do produto; aqui ela é aplicada ao mês comparável
   * ESCOLHIDO, que pode não ser o imediatamente anterior.
   *
   * O preço é visível e é o certo: a comparação ignora 3 dias reais de março.
   * O KPI do mês continua mostrando o mês inteiro — é só a base comparável
   * que encurta, e `rotuloComparacao` declara a janela usada.
   */
  const dias = ateDia === null
    ? null
    : Math.min(ateDia, diasNoMes(anteriorInteiro.periodo))

  const atual = dias === ateDia ? atualPedido : await kpisDoPeriodo(periodo, dias)

  const anterior = dias === null
    ? anteriorInteiro
    : await kpisDoPeriodo(anteriorInteiro.periodo, dias)

  return { atual, anterior, ateDia: dias, emCurso }
}

export interface LinhasReceita {
  /** A tarifa transacional JÁ SEM o MRR embutido. Ver a repartição abaixo. */
  tarifario: number
  float: number
  /** Sustentação — fatia separada de dentro do tarifário, não acréscimo. */
  sustentacao: number
  /** Mensalidade de API — a outra fatia do MRR, pela mesma razão. */
  mensalidades: number
  setup: number
  /** `tarifário bruto + float + setup`. O faturamento do período. */
  total: number
}

/**
 * As CINCO linhas de receita. Cada uma tem origem única, e a soma é o
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
 *
 * ── O FATURAMENTO SOMAVA A SUSTENTAÇÃO DUAS VEZES ───────────────────────
 *
 * O total era `tarifário + float + sustentação + setup`, com o tarifário
 * ÍNTEGRO. Mas sustentação e mensalidade de API já estão DENTRO da tarifa —
 * então o mesmo dinheiro entrava uma vez no tarifário e outra na sua própria
 * linha, e o tile "Faturamento" do Conselho vinha inflado pelo MRR inteiro.
 *
 * É o MESMO defeito que a composição do Conselho tinha, no segundo lugar onde
 * ele morava. A correção é a mesma e vem da MESMA função pura: o MRR é
 * SEPARADO do tarifário (`repartirTransacional`), e o total volta a ser o
 * tarifário BRUTO mais float e setup — cada real uma vez só.
 *
 * As MENSALIDADES passaram a ser uma linha própria. Antes não apareciam aqui
 * de forma alguma: ficavam silenciosamente dentro do tarifário, e tirá-las de
 * lá sem lhes dar linha faria o faturamento encolher sem explicação.
 */
export async function linhasReceita(periodo: string): Promise<LinhasReceita | null> {
  const referencia = new Date(intervaloMes(periodo).fim.getTime() - 1)
  const [kpis, lancado, parceiros, mrr] = await Promise.all([
    kpisDoPeriodo(periodo),
    receitaPorNatureza(periodo),
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: { sustentacao: true, sustentacaoInicio: true },
    }),
    calcularMrr(periodo),
  ])

  const sustentacaoCadastro = parceiros.reduce(
    (a, p) => a + (sustentacaoVigente(p.sustentacaoInicio, referencia) ? (p.sustentacao ?? 0) : 0),
    0,
  )

  const flt = lancado.FLOAT > 0 ? lancado.FLOAT : (kpis.float ?? 0)
  const sustentacao = lancado.SUSTENTACAO > 0 ? lancado.SUSTENTACAO : sustentacaoCadastro
  const setup = lancado.SETUP

  // A MESMA repartição da composição do Conselho — uma função, dois leitores.
  // A invariante dela garante que o total abaixo é o tarifário BRUTO mais
  // float e setup, qualquer que seja o MRR.
  const rep = repartirTransacional(
    kpis.receitaTarifaria ?? 0, sustentacao, parcelasDoMrr(mrr).mensalidades,
  )

  const total = rep.transacional + rep.sustentacao + rep.mensalidades + flt + setup

  if (!kpis.temDados && total === 0) return null

  return {
    tarifario: rep.transacional,
    float: flt,
    sustentacao: rep.sustentacao,
    mensalidades: rep.mensalidades,
    setup,
    total,
  }
}

/* ========================================================================= *
 * A REPARTIÇÃO DO TRANSACIONAL — o MRR sai de dentro dele, não por cima
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────
 *
 * A sustentação de BaaS e a mensalidade de API JÁ ESTÃO DENTRO da tarifa
 * transacional: é assim que a Bass Pago cobra, e é na apuração das tarifas que
 * esses valores são contabilizados. Então eles não são receita NOVA — são uma
 * FATIA da que já foi lançada.
 *
 * R$ 1 milhão de tarifa transacional com R$ 100 mil de MRR de sustentação
 * exibe R$ 900 mil de transacional e R$ 100 mil de sustentação. A soma continua
 * R$ 1 milhão, e cada real aparece uma vez só.
 *
 * ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────
 *
 * A sustentação era SOMADA ao transacional íntegro: o mesmo milhão virava
 * R$ 1,1 milhão de faturamento. E as mensalidades, embora já ficassem fora do
 * total, eram exibidas ao lado do transacional íntegro — o mesmo dinheiro
 * aparecendo duas vezes na tela, ainda que uma vez só na soma.
 *
 * ── A INVARIANTE QUE ESTA FUNÇÃO GARANTE ────────────────────────────────
 *
 *   transacional + sustentacao + mensalidades === bruto
 *
 * É ela que torna a repartição verificável: qualquer que seja o MRR, a
 * contribuição do transacional ao faturamento é sempre o que foi lançado.
 *
 * ── A ORDEM E O TETO ────────────────────────────────────────────────────
 *
 * O MRR pode ser MAIOR que a tarifa lançada — começo de mês, ou mês sem
 * lançamento diário, com contratos vigentes. Não há de onde tirar a fatia, e
 * inventá-la criaria receita que ninguém faturou. Então a repartição é capada
 * no bruto, a SUSTENTAÇÃO primeiro (é piso contratual; a mensalidade de API
 * varia com a carteira), e o que não couber vira `excedente` — devolvido para
 * que a tela possa DECLARAR que existe contrato ainda não refletido na tarifa,
 * em vez de deixar o número simplesmente faltar.
 * ========================================================================= */

export interface ReparticaoTransacional {
  /** A tarifa transacional LANÇADA, íntegra. A base de toda a repartição. */
  bruto: number
  /** A tarifa que sobra depois de separar o MRR. É a linha "Transacional". */
  transacional: number
  /** A fatia de sustentação que o bruto comporta. Entra no total. */
  sustentacao: number
  /** A fatia de mensalidades que o bruto comporta. Entra no total. */
  mensalidades: number
  /** Sustentação + mensalidades APURADAS, sem teto. O MRR do período. */
  mrr: number
  /** O MRR que não cabe no bruto. Zero no caso normal. */
  excedente: number
}

/** A repartição. PURA — a invariante acima é verificável sem banco. */
export function repartirTransacional(
  bruto: number, sustentacao: number, mensalidades: number,
): ReparticaoTransacional {
  const base = Math.max(bruto, 0)
  const sust = Math.min(Math.max(sustentacao, 0), base)
  const mens = Math.min(Math.max(mensalidades, 0), base - sust)
  const mrr = Math.max(sustentacao, 0) + Math.max(mensalidades, 0)
  return {
    bruto: base,
    transacional: base - sust - mens,
    sustentacao: sust,
    mensalidades: mens,
    mrr,
    excedente: mrr - sust - mens,
  }
}

/* ========================================================================= *
 * TAKE RATE — a receita ELEGÍVEL sobre o TPV
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────
 *
 *   take rate = (tarifa transacional + lançamentos de BaaS) ÷ TPV
 *
 * ENTRAM: a tarifa transacional do Lançamento Diário e a apuração dos
 * parceiros (os lançamentos de receita vinculados a uma condição BaaS).
 *
 * FICAM FORA: setup, sustentação e mensalidades. Setup é implantação, não
 * tarifa sobre volume. Sustentação e mensalidades são MRR — e, por serem uma
 * FATIA da tarifa transacional (ver a repartição acima), ficar de fora aqui
 * significa DESCONTÁ-LAS do numerador, não apenas não somá-las.
 *
 * TPV de R$ 1 bilhão com receita elegível de R$ 10 milhões dá 1%.
 *
 * ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────
 *
 * O take rate era `receitaTarifaria ÷ tpv`, direto do Lançamento Diário. Ele
 * incluía o MRR embutido na tarifa (inflando a eficiência tarifária com
 * recorrência que não depende de volume) e ignorava a apuração dos parceiros
 * inteira — num mês com lançamento BaaS, a maior linha de receita do período
 * não aparecia no indicador que mede justamente a receita sobre o volume.
 *
 * ── A JANELA ────────────────────────────────────────────────────────────
 *
 * `ateDia` trunca TPV, tarifa e lançamentos de BaaS na MESMA janela, para que
 * o mês em curso possa ser comparado com a mesma janela do mês anterior — é a
 * regra de `comparacaoMensal`, e o take rate não tem motivo para fugir dela.
 *
 * O MRR NÃO É TRUNCADO: é contrato do mês, não volume acumulado, e ratear uma
 * mensalidade por dias decorridos seria inventar um número que nenhum contrato
 * do sistema conhece. Como ele entra IGUAL nos dois lados da comparação, não
 * distorce a variação.
 *
 * ── UMA FONTE ───────────────────────────────────────────────────────────
 *
 * `KpisPeriodo` deixou de ter `takeRate`. Cockpit, Conselho, a API do Cockpit
 * e o realizado da meta TAKE_RATE leem desta função — um take rate calculado
 * em quatro lugares é como eles passam a discordar, e aqui o número depende de
 * três fontes diferentes, o que torna a divergência mais fácil, não menos.
 * ========================================================================= */

export interface BaseTakeRate {
  periodo: string
  /** A janela usada: `null` = mês inteiro. */
  ateDia: number | null
  /** TPV da janela. `null` quando o período não tem lançamento diário. */
  tpv: number | null
  /** Tarifa transacional da janela, JÁ SEM o MRR embutido. */
  tarifas: number
  /** Apuração dos parceiros — os lançamentos de BaaS da janela. */
  lancamentosBaas: number
  /** `tarifas + lancamentosBaas`. O numerador. */
  receitaElegivel: number
  /** `receitaElegivel ÷ tpv × 100`. `null` sem TPV. */
  takeRate: number | null
  /** O MRR descontado das tarifas, aberto — para a tela poder declará-lo. */
  excluido: { sustentacao: number; mensalidades: number }
}

/** O percentual. PURO. `null` sem TPV — nunca uma divisão por zero. */
export function calcularTakeRate(receitaElegivel: number, tpv: number | null): number | null {
  if (tpv === null || tpv <= 0) return null
  return (receitaElegivel / tpv) * 100
}

/**
 * O take rate de um período, com o numerador aberto.
 *
 * Três fontes, em paralelo: o Lançamento Diário (TPV e tarifa), os lançamentos
 * de receita (a linha BaaS da partição) e as condições comerciais mais a
 * carteira (o MRR, via `calcularMrr` — a mesma função do Cockpit).
 */
export async function baseTakeRate(
  periodo: string, ateDia?: number | null,
): Promise<BaseTakeRate> {
  const [kpis, linhas, mrr] = await Promise.all([
    kpisDoPeriodo(periodo, ateDia),
    receitaLancadaPorLinha(periodo, ateDia),
    calcularMrr(periodo),
  ])

  const { sustentacao, mensalidades } = parcelasDoMrr(mrr)
  // A SUSTENTAÇÃO LANÇADA tem precedência sobre a do cadastro, pela mesma
  // regra de `linhasReceita` e da composição do Conselho: ou foi lançada, ou é
  // derivada — nunca as duas, que é onde a dupla contagem apareceria.
  const sust = linhas.sustentacao > 0 ? linhas.sustentacao : sustentacao
  const rep = repartirTransacional(kpis.receitaTarifaria ?? 0, sust, mensalidades)

  const receitaElegivel = rep.transacional + linhas.baas
  return {
    periodo,
    ateDia: ateDia ?? null,
    tpv: kpis.tpv,
    tarifas: rep.transacional,
    lancamentosBaas: linhas.baas,
    receitaElegivel,
    takeRate: calcularTakeRate(receitaElegivel, kpis.tpv),
    excluido: { sustentacao: rep.sustentacao, mensalidades: rep.mensalidades },
  }
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
 * Os tipos que SOMAM no total da receita realizada — agora os SEIS.
 *
 * ── MENSALIDADES E SUSTENTAÇÃO VOLTARAM À SOMA, E NÃO É UM RECUO ────────
 *
 * Antes, MENSALIDADES ficava fora porque somá-la ao transacional ÍNTEGRO
 * contaria o mesmo dinheiro duas vezes — o diagnóstico estava certo, e a
 * correção estava no lugar errado. Tirá-la do total deixava o leitor com duas
 * figuras do mesmo milhão lado a lado, e mantinha a barra de composição
 * abaixo de 100%.
 *
 * Agora o MRR é DESCONTADO do transacional (ver `repartirTransacional`): a
 * linha Transacional mostra R$ 900 mil, Sustentação mostra R$ 100 mil, e as
 * duas somam o R$ 1 milhão que foi lançado. Elas somam porque são FATIAS da
 * mesma receita, não acréscimos a ela — e é a repartição, não a exclusão do
 * total, que impede a duplicidade.
 *
 * A consequência visível é a que se quer: a barra de composição fecha em
 * 100%, cada linha tem um percentual legítimo, e o faturamento do período não
 * muda por causa de como ele é dividido.
 *
 * FLOAT entra, como sempre entrou: é receita realizada e não está dentro de
 * nenhuma outra linha (viaja junto de SERVIÇOS, ver `composicaoReceitaConselho`).
 */
export const TIPOS_QUE_SOMAM: readonly TipoReceitaConselho[] = TIPOS_RECEITA_CONSELHO

export function somaNoTotal(tipo: TipoReceitaConselho): boolean {
  return TIPOS_QUE_SOMAM.includes(tipo)
}

export interface ComposicaoReceita {
  linhas: Array<{
    tipo: TipoReceitaConselho
    label: string
    valor: number
    /**
     * A linha entra no total? Hoje as SEIS entram — ver `TIPOS_QUE_SOMAM`.
     *
     * O campo continua porque é ele que a tela consulta para montar a barra
     * de composição e os percentuais; um `true` constante lido de uma fonte
     * é melhor que a tela presumindo que todas somam.
     */
    soma: boolean
  }>
  /** Soma das linhas que somam. É o faturamento do período. */
  total: number
  /**
   * A REPARTIÇÃO do transacional, para a tela poder explicar a divisão.
   *
   * `bruto` é a tarifa lançada; `transacional`, o que sobra dela depois de
   * separar o MRR; `sustentacao` e `mensalidades`, as fatias separadas. A
   * invariante é `transacional + sustentacao + mensalidades === bruto`.
   */
  reparticao: ReparticaoTransacional
  /**
   * Mensalidades de API — a parcela do MRR, íntegra, antes do teto do bruto.
   *
   * Mantido com o nome que as telas já usavam. Agora ele é IGUAL à linha
   * MENSALIDADES no caso normal, e MAIOR que ela quando o MRR não cabe na
   * tarifa lançada (ver `ReparticaoTransacional.excedente`).
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
 * SUSTENTAÇÃO E MENSALIDADE DE API JÁ ESTÃO DENTRO DA TARIFA TRANSACIONAL. É
 * assim que a Bass Pago cobra: as duas são apuradas junto com o transacional, e
 * o que chega ao Lançamento Diário como `receitaTarifaria` já as contém.
 *
 * Então elas não são somadas ao faturamento — são SEPARADAS de dentro dele.
 * R$ 1 milhão de tarifa lançada com R$ 100 mil de MRR de sustentação exibe
 * R$ 900 mil de transacional e R$ 100 mil de sustentação, e o faturamento do
 * período continua R$ 1 milhão. A conta está em `repartirTransacional`, que é
 * pura e é a mesma que o take rate usa.
 *
 * O QUE ESTAVA ERRADO: a sustentação era somada ao transacional ÍNTEGRO, e o
 * mesmo milhão virava R$ 1,1 milhão de faturamento. As mensalidades já ficavam
 * fora do total, mas eram exibidas ao lado do transacional íntegro — o mesmo
 * dinheiro em duas figuras da mesma tela.
 *
 * ── A PARTIÇÃO DOS LANÇAMENTOS ──────────────────────────────────────────
 *
 * Cada real dos LANÇAMENTOS entra em exatamente uma linha, pela ordem de
 * `linhaDaReceitaLancada` (lib/financeiro) — que é agora a única cópia dessa
 * regra, compartilhada com o realizado das metas de receita:
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
  const referencia = new Date(intervaloMes(periodo).fim.getTime() - 1)

  const [kpis, mrr, parceiros, lancadas] = await Promise.all([
    kpisDoPeriodo(periodo),
    calcularMrr(periodo),
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: { sustentacao: true, sustentacaoInicio: true },
    }),
    // A MESMA partição que o realizado da meta de Serviços lê.
    receitaLancadaPorLinha(periodo),
  ])

  const sustentacaoCadastro = parceiros.reduce(
    (a, p) => a + (sustentacaoVigente(p.sustentacaoInicio, referencia) ? (p.sustentacao ?? 0) : 0),
    0,
  )

  const { mensalidades } = parcelasDoMrr(mrr)
  const sustentacao = lancadas.sustentacao > 0 ? lancadas.sustentacao : sustentacaoCadastro

  // O MRR SAI DE DENTRO DO TRANSACIONAL. A invariante da repartição garante
  // que `transacional + sustentacao + mensalidades` volta a dar o bruto, então
  // o total abaixo é sempre o que foi lançado — não muda com a divisão.
  const reparticao = repartirTransacional(
    kpis.receitaTarifaria ?? 0, sustentacao, mensalidades,
  )

  const valores: Record<TipoReceitaConselho, number> = {
    TRANSACIONAL: reparticao.transacional,
    SETUP: lancadas.setup,
    MENSALIDADES: reparticao.mensalidades,
    SUSTENTACAO: reparticao.sustentacao,
    // Serviços recebe o Float junto: as duas são receita realizada que não
    // pertence a nenhuma das outras linhas, e o Conselho tem seis tipos —
    // criar um sétimo para o Float contrariaria a lista oficial.
    SERVICOS: lancadas.servicos + lancadas.float,
    BAAS: lancadas.baas,
  }

  const linhas = TIPOS_RECEITA_CONSELHO.map((t) => ({
    tipo: t,
    label: TIPO_RECEITA_LABEL[t],
    valor: valores[t],
    soma: somaNoTotal(t),
  }))

  return {
    linhas,
    total: linhas.filter((l) => l.soma).reduce((a, l) => a + l.valor, 0),
    reparticao,
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
  takeRate: BaseTakeRate | null = null,
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
    /**
     * TAKE RATE tem FONTE PRÓPRIA, e por isso entra por parâmetro.
     *
     * Ele deixou de ser `receitaTarifaria ÷ tpv` do Lançamento Diário: passou
     * a ser a receita ELEGÍVEL (tarifa sem o MRR, mais os lançamentos de BaaS)
     * sobre o TPV — três fontes, que `KpisPeriodo` não conhece. `null` aqui
     * significa "ninguém apurou a base", e a meta aparece como SEM_REALIZADO
     * em vez de ser avaliada contra zero. Ver `baseTakeRate`.
     */
    TAKE_RATE: takeRate ? takeRate.takeRate : null,
  }
}

/**
 * Os tipos de meta cuja receita realizada NÃO sai do Lançamento Diário.
 *
 * As três linhas que alimentam a Previsão de Receita têm fonte própria:
 * `LancamentoBaas` para a apuração dos parceiros, e a partição dos lançamentos
 * de receita para setup e serviços — a natureza SETUP das categorias e o RESTO
 * da partição, respectivamente (ver `receitaLancadaPorLinha`).
 *
 * SERVIÇOS DEIXOU DE SER AUSENTE. O realizado dele era `null` fixo, e a meta
 * nunca saía de SEM_REALIZADO por mais lançamentos que entrassem. Ver
 * `RealizadoReceitaPrevisao.servicos` para o porquê da mudança.
 *
 * Exportada pela mesma razão de `META_TIPOS_PIPELINE`: a API de metas precisa
 * saber quais tipos têm realizado apurável, e uma segunda cópia da lista lá é
 * como as duas divergem.
 */
export const META_TIPOS_RECEITA_PREVISAO: readonly string[] = [
  'RECEITA_LANCAMENTOS_WL_BAAS', 'RECEITA_SERVICOS', 'RECEITA_SETUP',
]

export function ehMetaDeReceitaDaPrevisao(tipo: string): boolean {
  return META_TIPOS_RECEITA_PREVISAO.includes(tipo)
}

/** O realizado de uma das três, a partir da apuração já buscada. */
export function realizadoDeMetaDeReceita(
  r: RealizadoReceitaPrevisao, tipo: string,
): number | null {
  switch (tipo) {
    case 'RECEITA_LANCAMENTOS_WL_BAAS': return r.lancamentosWlBaas
    case 'RECEITA_SERVICOS': return r.servicos
    case 'RECEITA_SETUP': return r.setup
    default: return null
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
 * ── A DATA MÍNIMA: 01/06/2026 ───────────────────────────────────────────
 *
 * A "Evolução Atividade Operacional Diária" — e, com ela, toda série de
 * resolução DIÁRIA do Cockpit — começa em 01/06/2026.
 *
 * ERA 01/10/2026, e o piso de outubro existia por um motivo que deixou de
 * valer: de fevereiro a setembro cada mês tinha UM lançamento só, gravado no
 * último dia, com o valor do MÊS INTEIRO. Uma série diária alimentada por
 * esses registros desenharia 29 dias vazios e um pico de R$ 30 milhões — e é
 * por isso que o piso cortava tudo antes de outubro.
 *
 * A normalização histórica (migration v29) distribuiu esses consolidados dia
 * a dia, com soma idêntica ao original. Junho é o primeiro mês em que existe
 * TPV real, então é de junho que a base passa a sustentar leitura diária.
 *
 * FEVEREIRO A MAIO FICAM FORA, e não por capricho: eles só têm quantidade de
 * transações — TPV, receita e MED são zero, e zero ali é ausência de
 * apuração, não resultado. Os lançamentos continuam no banco (nada foi
 * apagado); o que o piso diz é que a série diária não começa neles.
 *
 * É uma CONSTANTE, não uma data móvel. "O dia 1º de junho mais recente"
 * pareceria mais esperto e seria errado: em julho de 2027 o piso saltaria
 * para 01/06/2027 e apagaria um ano de operação real. O piso marca quando a
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
 * O PISO da série diária do Cockpit: 01/06/2026.
 *
 * Exportado para que a tela possa declará-lo e os testes possam prendê-lo.
 */
export const DATA_MINIMA_ATIVIDADE = new Date(Date.UTC(2026, 5, 1))

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
  /** A janela pedida foi ENCURTADA pelo piso de 01/06? */
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
 * O PISO DE 01/06 NÃO SE APLICA AQUI. Ele é uma afirmação sobre quando o
 * LANÇAMENTO DIÁRIO passou a sustentar leitura diária; a história das
 * condições comerciais é outra coisa e tem o seu próprio começo.
 *
 * ── O PISO DESTA SÉRIE É A DISPONIBILIDADE REAL DO DADO ─────────────────
 *
 * E isto é a correção de um defeito visível. Os três gráficos desenhavam ZERO
 * em todo mês anterior ao cadastro das condições comerciais — em Production,
 * as 20 condições foram criadas em 01–02/10/2026, então a série mostrava uma
 * rampa de 0 para 9 entre setembro e outubro, como se nove parceiros tivessem
 * entrado num mês.
 *
 * Nenhum entrou. A Bass Pago já tinha parceiros; o CADASTRO deles é que é
 * novo. Zero não era o número — era a ausência de registro desenhada como
 * número, que é exactamente o que o produto recusa na série diária (dia sem
 * lançamento fica fora, não vira zero).
 *
 * Então a série começa em `primeiroMesComParceiros()` e nada é desenhado
 * antes: nem zero, nem estimativa, nem repetição do primeiro valor conhecido.
 * Quando isso deixa um ponto só, o gráfico diz que a série é curta — ver
 * `SerieMensalCurta` — em vez de inventar o segundo ponto para ter uma linha.
 */
export async function serieMensalCockpit(
  dias: RangeDias, hoje: Date = new Date(),
): Promise<PontoMensalCockpit[]> {
  const j = janelaDiaria(dias, hoje)

  const disponivelDe = await primeiroMesComParceiros()
  // Sem nenhuma condição cadastrada não há série — e não há zero tampouco.
  if (!disponivelDe) return []

  // Os meses que a janela atravessa, do mais antigo ao mais novo. A janela é
  // de calendário, então basta caminhar de mês em mês entre as duas pontas.
  const meses: string[] = []
  const cursor = new Date(Date.UTC(j.inicio.getUTCFullYear(), j.inicio.getUTCMonth(), 1))
  const ultimo = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))
  while (cursor.getTime() <= ultimo.getTime()) {
    const mes = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    // Comparação de strings "YYYY-MM" é ordenação cronológica.
    if (mes >= disponivelDe) meses.push(mes)
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
  /**
   * De que mês a série MENSAL passa a existir — o cadastro mais antigo de
   * condição comercial. `null` sem nenhuma condição cadastrada.
   *
   * A tela declara isto. Sem a frase, um usuário que escolhe 90 dias e vê um
   * ponto só nos três gráficos mensais concluiria que estão quebrados, quando
   * o que há é um mês de histórico — ver `serieMensalCockpit`.
   */
  mensalDisponivelDe: string | null
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
  const [diario, mensal, mensalDisponivelDe] = await Promise.all([
    serieDiaria(dias, hoje),
    serieMensalCockpit(dias, hoje),
    primeiroMesComParceiros(),
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
    mensalDisponivelDe,
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

  // As metas de pipeline têm outra fonte (Lead e Deal), e as três de receita
  // da Previsão têm a sua. As consultas só acontecem se existir alguma meta
  // daquele tipo no período — não se paga por nada.
  const temPipeline = metas.some((m) => ehMetaDePipeline(m.tipo))
  const temReceita = metas.some((m) => ehMetaDeReceitaDaPrevisao(m.tipo))
  // TAKE_RATE também tem fonte própria desde que deixou de sair do Lançamento
  // Diário — e, como as outras duas, só é consultada se houver meta do tipo.
  const temTakeRate = metas.some((m) => m.tipo === 'TAKE_RATE')
  const [pipeline, receita, takeRate] = await Promise.all([
    temPipeline ? realizadoPipeline(periodo) : null,
    temReceita ? realizadoReceitaPrevisao(periodo) : null,
    temTakeRate ? baseTakeRate(periodo) : null,
  ])

  return metas.map((m) => {
    // O realizado depende da unidade da meta — ver `realizadoPorTipo`.
    const realizado = ehMetaDePipeline(m.tipo)
      ? (pipeline ? realizadoDeMetaPipeline(pipeline, m.tipo, m.unidade) : null)
      : ehMetaDeReceitaDaPrevisao(m.tipo)
        ? (receita ? realizadoDeMetaDeReceita(receita, m.tipo) : null)
        : (realizadoPorTipo(kpis, m.unidade, takeRate)[m.tipo] ?? null)
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
