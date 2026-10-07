/**
 * PREVISÃO — as consultas e a composição. A aritmética mora em
 * `lib/previsao-calculo.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A REGRA QUE GOVERNA ESTE MÓDULO: **PREVISTO E REALIZADO SÃO BASES
 * DIFERENTES, E O REALIZADO TEM UMA FONTE SÓ.**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As tabelas novas (`Orcamento`, `DespesaFutura`, `ReceitaPrevista`) guardam
 * SÓ o lado previsto. O realizado NUNCA é digitado nelas: é apurado dos
 * lançamentos, pelo mesmo caminho que a Visão Geral Financeira usa.
 *
 * Um campo "valor realizado" preenchido à mão criaria uma segunda versão do
 * faturamento, que divergiria da primeira no primeiro ajuste de lançamento — e
 * aí duas telas do mesmo sistema responderiam números diferentes para "quanto
 * faturamos em outubro". É o defeito que este produto evita desde a v16.
 *
 * ── DE ONDE VEM CADA NÚMERO ─────────────────────────────────────────────
 *
 *   PREVISTO
 *     orçamento                → `Orcamento`
 *     receita esperada         → `ReceitaPrevista`
 *     despesa esperada         → `DespesaFutura`
 *
 *   REALIZADO (sempre `LancamentoFinanceiro`)
 *     receita/despesa          → por COMPETÊNCIA (`data`)
 *     caixa                    → por LIQUIDAÇÃO (`status = PAGO`)
 *     a receber / a pagar      → `status = PENDENTE`, por `dataVencimento`
 *
 * ── A DUPLA CONTAGEM, E AS QUATRO PORTAS POR ONDE ELA ENTRARIA ──────────
 *
 * 1. `ContaReceber` NÃO É SOMADA AQUI. Ela é o MESMO dinheiro que o
 *    `LancamentoFinanceiro` de receita, visto como cobrança — e todas as suas
 *    linhas nascem do Lançamento BaaS (a rota de Contas a Receber recusa
 *    criação manual, com 405). Somá-la ao lado da receita contaria a tarifa
 *    BaaS duas vezes.
 *
 * 2. RECEITA PREVISTA entra pelo REMANESCENTE (previsto − realizado), nunca
 *    pelo valor cheio. Novembro com 500 mil previstos e 300 mil lançados vale
 *    300 mil reais + 200 mil de expectativa — não 800 mil.
 *
 * 3. DESPESA FUTURA com `lancamentoId` preenchido SAI da projeção: ela já
 *    virou lançamento, e o lançamento é que conta.
 *
 * 4. `LancamentoDiario.saldoEmConta` NÃO É CAIXA DA BASS PAGO. É o saldo da
 *    conta transacional — dinheiro de cliente em trânsito, que é justamente o
 *    que o Float mede. Usá-lo como caixa próprio inflaria o saldo em ordens de
 *    grandeza. O caixa aqui é sempre derivado de liquidação de lançamento.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { intervaloMes, periodoEmCurso, diaDoMes, diasNoMes } from '@/lib/periodo'
import {
  centavos, execucao, previstoRealizado, calcularForecast, projecaoDoPeriodo,
  curvaCaixa, diferencaResultadoCaixa, ocorrenciasDespesa, tendencia, media,
  JANELAS_MESES,
  type Execucao, type PrevistoRealizado, type Forecast, type PontoCaixa,
  type MovimentoCaixa, type DiferencaResultadoCaixa,
} from '@/lib/previsao-calculo'

/**
 * AS CONSTANTES DE APRESENTAÇÃO MORAM NO MÓDULO PURO, e são REEXPORTADAS aqui.
 *
 * ── POR QUE, E QUAL BUILD ISSO CONSERTA ─────────────────────────────────
 *
 * Este arquivo importa `lib/prisma`, que importa `pg`, que faz `require('fs')`.
 * Quando um Client Component importava `STATUS_PREVISAO` daqui, o bundler
 * seguia a cadeia inteira e tentava colocar o driver do Postgres no navegador:
 *
 *   pg-connection-string → pg → lib/prisma → lib/previsao → ReceitasClient
 *   Module not found: Can't resolve 'fs'
 *
 * E o build FALHAVA — não era um aviso.
 *
 * `tsc` não pega isso: importar um módulo de servidor num componente de
 * cliente é TypeScript perfeitamente válido. Só o bundler reclama, e só no
 * build de produção.
 *
 * Então as listas e os rótulos — que são dados puros, sem consulta — vivem em
 * `lib/previsao-calculo.ts`, que não toca em Prisma. Os formulários importam
 * DE LÁ; estes reexports existem para que o código de servidor continue
 * achando tudo num lugar só.
 */
export {
  STATUS_PREVISAO, STATUS_PREVISAO_LABEL,
  STATUS_ORCAMENTO, STATUS_ORCAMENTO_LABEL,
  RECORRENCIAS, RECORRENCIA_LABEL,
  JANELAS_MESES, JANELA_LABEL,
} from '@/lib/previsao-calculo'
export type {
  StatusPrevisao, StatusOrcamentoValor, Recorrencia, JanelaMeses,
} from '@/lib/previsao-calculo'

export type TipoPrevisao = 'RECEITA' | 'DESPESA'

/* ========================================================================= *
 * FILTROS
 * ========================================================================= */

export interface FiltroPrevisao {
  /** "YYYY-MM". Ausente = período corrente. */
  periodo?: string
  /**
   * Quantos meses a janela cobre, terminando em `periodo`.
   *
   * 1 = mês, 3 = trimestre, 12 = ano. Trimestre e ano NÃO são granularidades
   * próprias no banco: são a soma dos meses que os compõem, feita aqui. Uma
   * coluna "trimestre" exigiria decidir o que fazer quando o trimestre mudasse
   * de definição, e duplicaria o dado mensal.
   */
  meses?: number
  centroCustoId?: string
  categoriaId?: string
  tipo?: TipoPrevisao
  fornecedorId?: string
  condicaoId?: string
}

/** Os períodos "YYYY-MM" da janela, do mais antigo ao mais recente. */
export function periodosDaJanela(periodo: string, meses = 1): string[] {
  const [ano, mes] = periodo.split('-').map(Number)
  const n = Math.max(1, Math.min(meses, 36))
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (n - 1 - i), 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/** Primeiro instante do primeiro período e limite exclusivo do último. */
function janelaDatas(periodos: string[]): { inicio: Date; fim: Date } {
  return {
    inicio: intervaloMes(periodos[0]).inicio,
    fim: intervaloMes(periodos[periodos.length - 1]).fim,
  }
}

/** O mês de uma data, em "YYYY-MM". */
function mesDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * A fração do período já decorrida, de 0 a 1.
 *
 * Mês fechado = 1. Mês futuro = 0. Mês em curso = dia de hoje ÷ dias do mês —
 * a mesma grandeza que `calcularPacing` usa em Metas, e pelo mesmo motivo: o
 * realizado parcial de um mês em curso não se estende sem ela.
 */
export function fracaoDecorrida(periodo: string, hoje: Date = new Date()): number {
  const atual = mesDe(hoje)
  if (periodo < atual) return 1
  if (periodo > atual) return 0
  return Math.min(diaDoMes(hoje) / diasNoMes(periodo), 1)
}

/** O período já ENCERROU? Em período fechado nada é projetado. */
export function periodoFechado(periodo: string, hoje: Date = new Date()): boolean {
  return periodo < mesDe(hoje)
}

/* ========================================================================= *
 * O REALIZADO — sempre de `LancamentoFinanceiro`
 * ========================================================================= */

/**
 * O recorte dos lançamentos que o filtro implica.
 *
 * CANCELADO fica fora de tudo: é lançamento que não aconteceu. PENDENTE
 * ENTRA no realizado por competência, porque a apuração contábil é de
 * competência e não de caixa — a mesma regra de `resultadoDoPeriodo`.
 */
function whereLancamento(
  f: FiltroPrevisao, inicio: Date, fim: Date,
): Prisma.LancamentoFinanceiroWhereInput {
  return {
    data: { gte: inicio, lt: fim },
    status: { not: 'CANCELADO' },
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.centroCustoId ? { centroCustoId: f.centroCustoId } : {}),
    ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
    ...(f.fornecedorId ? { fornecedorId: f.fornecedorId } : {}),
    ...(f.condicaoId ? { condicaoId: f.condicaoId } : {}),
  }
}

export interface RealizadoPorPeriodo {
  periodo: string
  receita: number
  despesa: number
  resultado: number
}

/**
 * Receita, despesa e resultado REALIZADOS, mês a mês.
 *
 * UMA consulta para a janela inteira. A alternativa — uma chamada a
 * `resultadoDoPeriodo` por mês — pagaria N×2 idas ao banco para desenhar um
 * gráfico, que é o mesmo motivo pelo qual `evolucaoFinanceira` existe.
 *
 * A COMISSÃO BAAS ENTRA na despesa, como em todo o resto do sistema desde a
 * v28: a receita BaaS é o saldo integral apurado, e a comissão do parceiro é
 * despesa. Recortá-la aqui faria a Previsão discordar da Visão Geral.
 */
export async function realizadoPorPeriodo(
  periodos: string[], f: FiltroPrevisao = {},
): Promise<RealizadoPorPeriodo[]> {
  if (periodos.length === 0) return []
  const { inicio, fim } = janelaDatas(periodos)

  const linhas = await prisma.lancamentoFinanceiro.findMany({
    where: whereLancamento({ ...f, tipo: undefined }, inicio, fim),
    select: { tipo: true, valor: true, data: true },
  })

  const acc = new Map<string, { receita: number; despesa: number }>()
  for (const l of linhas) {
    const chave = mesDe(l.data)
    const atual = acc.get(chave) ?? { receita: 0, despesa: 0 }
    if (l.tipo === 'RECEITA') atual.receita += l.valor
    else atual.despesa += l.valor
    acc.set(chave, atual)
  }

  return periodos.map((p) => {
    const a = acc.get(p) ?? { receita: 0, despesa: 0 }
    return {
      periodo: p,
      receita: centavos(a.receita),
      despesa: centavos(a.despesa),
      resultado: centavos(a.receita - a.despesa),
    }
  })
}

/* ========================================================================= *
 * ORÇAMENTO × REALIZADO
 * ========================================================================= */

export interface LinhaOrcamento {
  /** Identifica o recorte: id do centro de custo, da categoria, ou `'—'`. */
  id: string
  nome: string
  tipo: TipoPrevisao
  execucao: Execucao
}

export interface OrcamentoConsolidado {
  periodos: string[]
  receita: Execucao
  despesa: Execucao
  /** Resultado ORÇADO (receita orçada − despesa orçada) × resultado realizado. */
  resultado: { orcado: number; realizado: number; desvio: number }
  porCentroCusto: LinhaOrcamento[]
  porCategoria: LinhaOrcamento[]
}

/**
 * ORÇADO × REALIZADO da janela, consolidado e aberto por centro de custo e
 * por categoria.
 *
 * ── RASCUNHO NÃO ENTRA ──────────────────────────────────────────────────
 *
 * Só orçamento APROVADO e ENCERRADO somam. Rascunho é orçamento sendo montado,
 * e incluí-lo mostraria um teto que ninguém aprovou — e faria o "% utilizado"
 * cair pela metade no momento em que alguém começasse a digitar o orçamento do
 * ano seguinte.
 *
 * ── O REALIZADO É ATRIBUÍDO PELO CENTRO DE CUSTO DO LANÇAMENTO ──────────
 *
 * Lançamento sem centro de custo não entra em nenhuma linha de área — e não é
 * redistribuído nem jogado num "Geral" inventado. Ele continua no consolidado,
 * então o total fecha; o que falta é a ATRIBUIÇÃO, e inventá-la seria afirmar
 * que a despesa é de uma área que ninguém informou.
 *
 * A diferença aparece na tela como "sem centro de custo", para que a soma das
 * áreas não parecer menor que o total por defeito do painel.
 */
export async function orcamentoVsRealizado(
  f: FiltroPrevisao = {}, hoje: Date = new Date(),
): Promise<OrcamentoConsolidado> {
  const periodo = f.periodo ?? mesDe(hoje)
  const periodos = periodosDaJanela(periodo, f.meses ?? 1)
  const { inicio, fim } = janelaDatas(periodos)

  const [orcamentos, lancamentos, centros, categorias] = await Promise.all([
    prisma.orcamento.findMany({
      where: {
        periodo: { in: periodos },
        // RASCUNHO fora: teto que ninguém aprovou não é teto.
        status: { in: ['APROVADO', 'ENCERRADO'] },
        ...(f.tipo ? { tipo: f.tipo } : {}),
        ...(f.centroCustoId ? { centroCustoId: f.centroCustoId } : {}),
        ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
      },
      select: {
        tipo: true, valor: true, centroCustoId: true, categoriaId: true,
      },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: whereLancamento({ ...f, tipo: undefined }, inicio, fim),
      select: { tipo: true, valor: true, centroCustoId: true, categoriaId: true },
    }),
    prisma.centroCusto.findMany({ select: { id: true, nome: true } }),
    prisma.categoriaFinanceira.findMany({ select: { id: true, nome: true } }),
  ])

  const nomeCentro = new Map(centros.map((c) => [c.id, c.nome]))
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]))

  /** Soma por tipo, para o consolidado. */
  const somar = <T extends { tipo: string; valor: number }>(l: T[], tipo: TipoPrevisao) =>
    l.filter((x) => x.tipo === tipo).reduce((a, x) => a + x.valor, 0)

  const orcadoReceita = somar(orcamentos, 'RECEITA')
  const orcadoDespesa = somar(orcamentos, 'DESPESA')
  const realReceita = somar(lancamentos, 'RECEITA')
  const realDespesa = somar(lancamentos, 'DESPESA')

  /**
   * Agrupa orçado e realizado pelo MESMO recorte, e devolve uma linha por
   * valor presente em qualquer um dos dois lados.
   *
   * Incluir os dois lados importa: uma área que gastou SEM orçamento é
   * exatamente o que o painel precisa mostrar, e uma área orçada que não gastou
   * nada também. Partir só do orçado esconderia a primeira; só do realizado,
   * a segunda.
   */
  function agrupar(
    chaveDe: (x: { centroCustoId: string | null; categoriaId: string | null }) => string | null,
    nomeDe: (id: string) => string | undefined,
    rotuloSemChave: string,
  ): LinhaOrcamento[] {
    const mapa = new Map<string, { nome: string; tipo: TipoPrevisao; orcado: number; realizado: number }>()

    const entrada = (chave: string | null, tipo: TipoPrevisao) => {
      const id = chave ?? '—'
      const k = `${tipo}:${id}`
      if (!mapa.has(k)) {
        mapa.set(k, {
          nome: chave ? (nomeDe(chave) ?? 'Removido') : rotuloSemChave,
          tipo, orcado: 0, realizado: 0,
        })
      }
      return mapa.get(k)!
    }

    for (const o of orcamentos) entrada(chaveDe(o), o.tipo as TipoPrevisao).orcado += o.valor
    for (const l of lancamentos) entrada(chaveDe(l), l.tipo as TipoPrevisao).realizado += l.valor

    return [...mapa.entries()]
      .map(([k, v]) => ({
        id: k,
        nome: v.nome,
        tipo: v.tipo,
        execucao: execucao(v.orcado, v.realizado),
      }))
      // Maior comprometimento primeiro: é a linha que exige atenção.
      .sort((a, b) =>
        (b.execucao.orcado || b.execucao.realizado) - (a.execucao.orcado || a.execucao.realizado))
  }

  return {
    periodos,
    receita: execucao(orcadoReceita, realReceita),
    despesa: execucao(orcadoDespesa, realDespesa),
    resultado: {
      orcado: centavos(orcadoReceita - orcadoDespesa),
      realizado: centavos(realReceita - realDespesa),
      desvio: centavos((realReceita - realDespesa) - (orcadoReceita - orcadoDespesa)),
    },
    porCentroCusto: agrupar(
      (x) => x.centroCustoId, (id) => nomeCentro.get(id), 'Sem centro de custo',
    ),
    porCategoria: agrupar(
      (x) => x.categoriaId, (id) => nomeCategoria.get(id), 'Sem categoria',
    ),
  }
}

/* ========================================================================= *
 * RECEITA PREVISTA × REALIZADA
 * ========================================================================= */

export interface PontoPrevisaoReceita extends PrevistoRealizado {
  periodo: string
}

/**
 * Faturamento PREVISTO × REALIZADO, mês a mês.
 *
 * CANCELADA fica fora: previsão cancelada não é expectativa. As demais entram,
 * inclusive REALIZADA — ela marca que a linha foi cumprida, e o previsto dela
 * continua sendo o que se esperava (apagá-lo da comparação faria o previsto do
 * mês encolher conforme as linhas fossem cumpridas, e o desvio sempre fechar
 * em zero).
 */
export async function receitaPrevistaVsRealizada(
  periodos: string[], f: FiltroPrevisao = {},
): Promise<PontoPrevisaoReceita[]> {
  if (periodos.length === 0) return []

  const [previstas, realizado] = await Promise.all([
    prisma.receitaPrevista.findMany({
      where: {
        periodo: { in: periodos },
        status: { not: 'CANCELADO' },
        ...(f.centroCustoId ? { centroCustoId: f.centroCustoId } : {}),
        ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
        ...(f.condicaoId ? { condicaoId: f.condicaoId } : {}),
      },
      select: { periodo: true, valorPrevisto: true },
    }),
    realizadoPorPeriodo(periodos, { ...f, tipo: 'RECEITA' }),
  ])

  const previstoPor = new Map<string, number>()
  for (const r of previstas) {
    previstoPor.set(r.periodo, (previstoPor.get(r.periodo) ?? 0) + r.valorPrevisto)
  }
  const realizadoPor = new Map(realizado.map((r) => [r.periodo, r.receita]))

  return periodos.map((p) => ({
    periodo: p,
    ...previstoRealizado(previstoPor.get(p) ?? 0, realizadoPor.get(p) ?? 0),
  }))
}

/* ========================================================================= *
 * DESPESA FUTURA × REALIZADA
 * ========================================================================= */

export interface PontoPrevisaoDespesa extends PrevistoRealizado {
  periodo: string
}

/**
 * Despesa PREVISTA × REALIZADA, mês a mês.
 *
 * A recorrência é EXPANDIDA na leitura (`ocorrenciasDespesa`), limitada à
 * janela consultada — ver lá por que a linha não é materializada.
 *
 * DESPESA JÁ MATERIALIZADA SAI DA PREVISÃO. Quando `lancamentoId` está
 * preenchido, a despesa virou lançamento, e é o lançamento que conta: manter
 * as duas somaria a mesma saída duas vezes.
 */
export async function despesaPrevistaVsRealizada(
  periodos: string[], f: FiltroPrevisao = {},
): Promise<PontoPrevisaoDespesa[]> {
  if (periodos.length === 0) return []

  const [futuras, realizado] = await Promise.all([
    prisma.despesaFutura.findMany({
      where: {
        status: { not: 'CANCELADO' },
        // Já virou lançamento? Então o lançamento é que conta.
        lancamentoId: null,
        ...(f.centroCustoId ? { centroCustoId: f.centroCustoId } : {}),
        ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
        ...(f.fornecedorId ? { fornecedorId: f.fornecedorId } : {}),
      },
      select: {
        valor: true, dataPrevista: true, recorrencia: true, recorrenciaFim: true,
      },
    }),
    realizadoPorPeriodo(periodos, { ...f, tipo: 'DESPESA' }),
  ])

  const previstoPor = new Map<string, number>()
  for (const d of futuras) {
    for (const o of ocorrenciasDespesa(d, periodos)) {
      previstoPor.set(o.periodo, (previstoPor.get(o.periodo) ?? 0) + o.valor)
    }
  }
  const realizadoPor = new Map(realizado.map((r) => [r.periodo, r.despesa]))

  return periodos.map((p) => ({
    periodo: p,
    ...previstoRealizado(previstoPor.get(p) ?? 0, realizadoPor.get(p) ?? 0),
  }))
}

/* ========================================================================= *
 * FLUXO DE CAIXA
 * ========================================================================= */

export interface FluxoDeCaixa {
  pontos: PontoCaixa[]
  /** Caixa acumulado antes do primeiro período da janela. */
  saldoAbertura: number
  /** Caixa realizado até HOJE, acumulado desde o começo dos registros. */
  caixaRealizadoHoje: number
  /** Resultado contábil × geração de caixa da janela, e a diferença. */
  contabilVsCaixa: DiferencaResultadoCaixa
  /**
   * Títulos a receber JÁ VENCIDOS e não recebidos, fora da projeção.
   *
   * Eles não entram em nenhum período futuro: o sistema não sabe quando serão
   * recebidos, e atribuí-los a um mês arbitrário produziria uma entrada que
   * ninguém prometeu. Devolvidos à parte para a tela poder declará-los — um
   * caixa projetado que ignora 200 mil vencidos em silêncio é pior que um
   * número ausente.
   */
  vencidoAReceber: number
  /** Títulos a pagar já vencidos e não pagos. Mesma razão. */
  vencidoAPagar: number
}

/**
 * CAIXA REALIZADO + ENTRADAS PREVISTAS − SAÍDAS PREVISTAS = CAIXA PROJETADO.
 *
 * ── O QUE CONTA COMO CAIXA, E O QUE NÃO ─────────────────────────────────
 *
 * REALIZADO: `LancamentoFinanceiro` com `status = PAGO`. É liquidação, não
 * competência — um lançamento de outubro pago em novembro é caixa de
 * novembro.
 *
 * A data de caixa é `dataVencimento` quando existe, e `data` como retaguarda:
 * é a melhor aproximação disponível de QUANDO o dinheiro se moveu. O schema
 * não guarda data de pagamento no lançamento (só `ContaReceber.dataPago` a
 * tem), e inventar uma coluna agora exigiria preencher o passado com um palpite.
 *
 * NÃO ENTRA: `LancamentoDiario.saldoEmConta`. É o saldo da conta
 * TRANSACIONAL — dinheiro de cliente em trânsito, exatamente o que o Float
 * mede. Somá-lo ao caixa da Bass Pago inflaria o saldo em ordens de grandeza
 * e misturaria dinheiro de terceiro com dinheiro próprio.
 *
 * ── O SALDO DE ABERTURA ─────────────────────────────────────────────────
 *
 * É o caixa acumulado ANTES da janela: todas as liquidações anteriores ao
 * primeiro período. Sem ele a curva começaria em zero e a projeção de dezembro
 * ignoraria tudo o que a empresa gerou até novembro.
 */
export async function fluxoDeCaixa(
  periodos: string[], f: FiltroPrevisao = {}, hoje: Date = new Date(),
): Promise<FluxoDeCaixa> {
  if (periodos.length === 0) {
    return {
      pontos: [],
      saldoAbertura: 0,
      caixaRealizadoHoje: 0,
      contabilVsCaixa: diferencaResultadoCaixa(0, 0),
      vencidoAReceber: 0,
      vencidoAPagar: 0,
    }
  }

  const { inicio, fim } = janelaDatas(periodos)
  const filtroComum = {
    ...(f.centroCustoId ? { centroCustoId: f.centroCustoId } : {}),
    ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
    ...(f.fornecedorId ? { fornecedorId: f.fornecedorId } : {}),
    ...(f.condicaoId ? { condicaoId: f.condicaoId } : {}),
  }

  const hojeDia = new Date(Date.UTC(
    hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(),
  ))

  const [
    liquidadosNaJanela, abertura, pendentesNaJanela,
    vencidos, previstasReceita, futurasDespesa, competencia,
  ] = await Promise.all([
    // LIQUIDADO na janela — o caixa que de fato se moveu.
    prisma.lancamentoFinanceiro.findMany({
      where: {
        status: 'PAGO',
        ...filtroComum,
        OR: [
          { dataVencimento: { gte: inicio, lt: fim } },
          { dataVencimento: null, data: { gte: inicio, lt: fim } },
        ],
      },
      select: { tipo: true, valor: true, data: true, dataVencimento: true },
    }),

    // SALDO DE ABERTURA: tudo liquidado ANTES da janela.
    prisma.lancamentoFinanceiro.groupBy({
      by: ['tipo'],
      where: {
        status: 'PAGO',
        ...filtroComum,
        OR: [
          { dataVencimento: { lt: inicio } },
          { dataVencimento: null, data: { lt: inicio } },
        ],
      },
      _sum: { valor: true },
    }),

    // PENDENTE com vencimento NA JANELA e AINDA NÃO vencido — o que se espera
    // receber e pagar. Vencido entra em `vencidos`, fora da projeção.
    prisma.lancamentoFinanceiro.findMany({
      where: {
        status: 'PENDENTE',
        ...filtroComum,
        dataVencimento: { gte: hojeDia, lt: fim },
      },
      select: { tipo: true, valor: true, dataVencimento: true },
    }),

    // VENCIDO e não liquidado. Fora da projeção, declarado à parte.
    prisma.lancamentoFinanceiro.groupBy({
      by: ['tipo'],
      where: {
        status: 'PENDENTE',
        ...filtroComum,
        dataVencimento: { lt: hojeDia },
      },
      _sum: { valor: true },
    }),

    receitaPrevistaVsRealizada(periodos, f),
    despesaPrevistaVsRealizada(periodos, f),

    // COMPETÊNCIA, para a diferença entre resultado contábil e caixa.
    realizadoPorPeriodo(periodos, f),
  ])

  /** A data de caixa de um lançamento: vencimento quando há, senão a data. */
  const mesCaixa = (l: { data: Date; dataVencimento: Date | null }) =>
    mesDe(l.dataVencimento ?? l.data)

  const movimentos = new Map<string, MovimentoCaixa>()
  const zero = (): MovimentoCaixa => ({
    entradasRealizadas: 0, entradasAReceber: 0, entradasPrevistas: 0,
    saidasRealizadas: 0, saidasAPagar: 0, saidasPrevistas: 0,
  })
  for (const p of periodos) movimentos.set(p, zero())

  for (const l of liquidadosNaJanela) {
    const m = movimentos.get(mesCaixa(l))
    if (!m) continue
    if (l.tipo === 'RECEITA') m.entradasRealizadas += l.valor
    else m.saidasRealizadas += l.valor
  }

  for (const l of pendentesNaJanela) {
    if (!l.dataVencimento) continue
    const m = movimentos.get(mesDe(l.dataVencimento))
    if (!m) continue
    if (l.tipo === 'RECEITA') m.entradasAReceber += l.valor
    else m.saidasAPagar += l.valor
  }

  // O REMANESCENTE, nunca o previsto cheio — ver `previstoRealizado`.
  for (const r of previstasReceita) {
    const m = movimentos.get(r.periodo)
    if (m) m.entradasPrevistas += r.remanescente
  }
  for (const d of futurasDespesa) {
    const m = movimentos.get(d.periodo)
    if (m) m.saidasPrevistas += d.remanescente
  }

  const somaTipo = (
    g: Array<{ tipo: string; _sum: { valor: number | null } }>, tipo: TipoPrevisao,
  ) => g.find((x) => x.tipo === tipo)?._sum.valor ?? 0

  const saldoAbertura = centavos(
    somaTipo(abertura, 'RECEITA') - somaTipo(abertura, 'DESPESA'),
  )

  const pontos = curvaCaixa(
    saldoAbertura,
    periodos.map((p) => ({
      periodo: p,
      movimento: movimentos.get(p)!,
      fechado: periodoFechado(p, hoje),
    })),
  )

  const geracaoCaixaJanela = pontos.reduce((a, p) => a + p.geracaoRealizada, 0)
  const resultadoContabilJanela = competencia.reduce((a, p) => a + p.resultado, 0)

  return {
    pontos,
    saldoAbertura,
    // O caixa realizado até hoje: a abertura mais o que se liquidou na janela
    // até agora. É o `saldoRealizado` do último período com liquidação.
    caixaRealizadoHoje: centavos(saldoAbertura + geracaoCaixaJanela),
    contabilVsCaixa: diferencaResultadoCaixa(resultadoContabilJanela, geracaoCaixaJanela),
    vencidoAReceber: centavos(somaTipo(vencidos, 'RECEITA')),
    vencidoAPagar: centavos(somaTipo(vencidos, 'DESPESA')),
  }
}

/* ========================================================================= *
 * FORECAST
 * ========================================================================= */

export interface ForecastPrevisao {
  /** `null` quando falta histórico — ver `MINIMO_MESES_FORECAST`. */
  receita: Forecast | null
  despesa: Forecast | null
  resultado: Forecast | null
  /** Caixa projetado, derivado do forecast de receita e despesa. */
  caixa: Forecast | null
  /** Os meses FECHADOS que alimentaram a conta. */
  mesesBase: string[]
  /** Os meses projetados, em "YYYY-MM". */
  mesesProjetados: string[]
  /** Por que não há forecast, quando não há. Vazio quando há. */
  motivo: string
}

/**
 * O FORECAST de receita, despesa, resultado e caixa.
 *
 * ── SÓ MESES FECHADOS ALIMENTAM A BASE ──────────────────────────────────
 *
 * O mês em curso está pela metade e puxaria a média para baixo por construção
 * — é o mesmo defeito que a comparação de KPI desta rodada corrige, e aqui
 * seria pior: ele contaminaria também a tendência e a projeção dos meses
 * seguintes.
 *
 * A PROJEÇÃO do mês em curso é calculada à parte (`projecaoDoPeriodo`), pelo
 * ritmo até agora, e entra como informação própria — não como base.
 *
 * ── SEM HISTÓRICO, SEM FORECAST ─────────────────────────────────────────
 *
 * Menos de três meses fechados com dado devolve `null` e um motivo legível. A
 * alternativa — projetar a partir de um ou dois pontos — produziria um número
 * com cara de previsão e nenhum conteúdo, e é exatamente o que o pedido proíbe.
 */
export async function forecastPrevisao(
  f: FiltroPrevisao = {}, horizonte = 3, historico = 12, hoje: Date = new Date(),
): Promise<ForecastPrevisao> {
  const atual = mesDe(hoje)
  const periodos = periodosDaJanela(atual, historico)

  const serie = await realizadoPorPeriodo(periodos, f)

  // Só os FECHADOS, e só os que têm algum movimento: um mês sem lançamento
  // nenhum é ausência de dado, não um mês de receita zero. Contá-lo como zero
  // afundaria a média e inventaria uma tendência de queda.
  const fechados = serie.filter(
    (s) => periodoFechado(s.periodo, hoje) && (s.receita !== 0 || s.despesa !== 0),
  )

  const mesesBase = fechados.map((s) => s.periodo)
  const mesesProjetados = Array.from({ length: horizonte }, (_, i) => {
    const [ano, mes] = atual.split('-').map(Number)
    const d = new Date(Date.UTC(ano, mes - 1 + i + 1, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })

  const receita = calcularForecast(fechados.map((s) => s.receita), horizonte)
  const despesa = calcularForecast(fechados.map((s) => s.despesa), horizonte)
  const resultado = calcularForecast(fechados.map((s) => s.resultado), horizonte)

  // A PROJEÇÃO DO MÊS EM CURSO, pelo ritmo até agora.
  const emCurso = serie.find((s) => s.periodo === atual)
  const fracao = fracaoDecorrida(atual, hoje)
  if (receita && emCurso) {
    receita.projecaoPeriodoAtual = projecaoDoPeriodo(emCurso.receita, fracao)
  }
  if (despesa && emCurso) {
    despesa.projecaoPeriodoAtual = projecaoDoPeriodo(emCurso.despesa, fracao)
  }
  if (resultado && emCurso) {
    resultado.projecaoPeriodoAtual = projecaoDoPeriodo(emCurso.resultado, fracao)
  }

  /**
   * O FORECAST DE CAIXA é derivado do de receita e despesa, não apurado à
   * parte.
   *
   * Projetar o caixa diretamente da série de liquidações daria um terceiro
   * número que não fecha com os dois primeiros — e a pergunta do executivo é
   * "se a receita e a despesa seguirem o ritmo, quanto sobra?". A resposta é a
   * diferença entre as duas projeções, e por construção ela fecha.
   */
  const caixa: Forecast | null = receita && despesa
    ? {
        mesesConsiderados: receita.mesesConsiderados,
        realizadoAcumulado: centavos(receita.realizadoAcumulado - despesa.realizadoAcumulado),
        mediaHistorica: centavos(receita.mediaHistorica - despesa.mediaHistorica),
        tendencia: tendencia(fechados.map((s) => s.resultado)),
        projecaoPeriodoAtual:
          receita.projecaoPeriodoAtual !== null && despesa.projecaoPeriodoAtual !== null
            ? centavos(receita.projecaoPeriodoAtual - despesa.projecaoPeriodoAtual)
            : null,
        proximosMeses: receita.proximosMeses.map((r, i) =>
          centavos(r - (despesa.proximosMeses[i] ?? 0))),
      }
    : null

  return {
    receita, despesa, resultado, caixa,
    mesesBase, mesesProjetados,
    motivo: receita
      ? ''
      : `São necessários pelo menos 3 meses fechados com lançamento para projetar. `
        + `Há ${fechados.length}.`,
  }
}

/* ========================================================================= *
 * CENTROS DE CUSTO — a visão detalhada
 * ========================================================================= */

export interface DetalheCentroCusto {
  id: string
  nome: string
  codigo: string | null
  ativo: boolean
  receita: Execucao
  despesa: Execucao
  /** Forecast da despesa da área. `null` sem histórico suficiente. */
  forecastDespesa: number | null
}

/**
 * Orçado, realizado, desvio, % utilizado e forecast POR CENTRO DE CUSTO.
 *
 * O forecast da área é a média dos meses fechados dela — a mesma conta do
 * forecast geral, sobre o recorte. `null` quando a área não tem histórico
 * suficiente, e nunca um número derivado do forecast global rateado: ratear o
 * total pelas áreas inventaria uma distribuição que ninguém observou.
 */
export async function detalhePorCentroCusto(
  f: FiltroPrevisao = {}, hoje: Date = new Date(),
): Promise<DetalheCentroCusto[]> {
  const periodo = f.periodo ?? mesDe(hoje)
  const periodos = periodosDaJanela(periodo, f.meses ?? 1)
  const { inicio, fim } = janelaDatas(periodos)

  // A janela do forecast por área: 12 meses até o período de referência.
  const janelaForecast = periodosDaJanela(periodo, 12)
  const datasForecast = janelaDatas(janelaForecast)

  const [centros, orcamentos, lancamentos, historico] = await Promise.all([
    prisma.centroCusto.findMany({
      where: f.centroCustoId ? { id: f.centroCustoId } : {},
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    }),
    prisma.orcamento.groupBy({
      by: ['centroCustoId', 'tipo'],
      where: { periodo: { in: periodos }, status: { in: ['APROVADO', 'ENCERRADO'] } },
      _sum: { valor: true },
    }),
    prisma.lancamentoFinanceiro.groupBy({
      by: ['centroCustoId', 'tipo'],
      where: { data: { gte: inicio, lt: fim }, status: { not: 'CANCELADO' } },
      _sum: { valor: true },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: {
        tipo: 'DESPESA',
        data: { gte: datasForecast.inicio, lt: datasForecast.fim },
        status: { not: 'CANCELADO' },
        centroCustoId: { not: null },
      },
      select: { centroCustoId: true, valor: true, data: true },
    }),
  ])

  const chave = (id: string | null, tipo: string) => `${id ?? '—'}:${tipo}`
  const orcadoPor = new Map(
    orcamentos.map((o) => [chave(o.centroCustoId, o.tipo), o._sum.valor ?? 0]),
  )
  const realPor = new Map(
    lancamentos.map((l) => [chave(l.centroCustoId, l.tipo), l._sum.valor ?? 0]),
  )

  // Despesa mensal de cada área, só nos meses FECHADOS: base do forecast.
  const porAreaMes = new Map<string, Map<string, number>>()
  for (const l of historico) {
    if (!l.centroCustoId) continue
    const mes = mesDe(l.data)
    if (!periodoFechado(mes, hoje)) continue
    const m = porAreaMes.get(l.centroCustoId) ?? new Map<string, number>()
    m.set(mes, (m.get(mes) ?? 0) + l.valor)
    porAreaMes.set(l.centroCustoId, m)
  }

  return centros.map((c) => {
    const meses = porAreaMes.get(c.id)
    const serie = meses ? [...meses.values()] : []
    return {
      id: c.id,
      nome: c.nome,
      codigo: c.codigo,
      ativo: c.ativo,
      receita: execucao(
        orcadoPor.get(chave(c.id, 'RECEITA')) ?? 0,
        realPor.get(chave(c.id, 'RECEITA')) ?? 0,
      ),
      despesa: execucao(
        orcadoPor.get(chave(c.id, 'DESPESA')) ?? 0,
        realPor.get(chave(c.id, 'DESPESA')) ?? 0,
      ),
      // Mínimo de 3 meses, como no forecast geral: dois pontos não dizem nada.
      forecastDespesa: serie.length >= 3 ? media(serie) : null,
    }
  })
}

/* ========================================================================= *
 * O PAINEL — tudo o que a Visão Geral da Previsão mostra
 * ========================================================================= */

export interface VisaoGeralPrevisao {
  periodo: string
  periodos: string[]
  /** A janela em meses: 1 = mês, 3 = trimestre, 12 = ano. */
  meses: number
  orcamento: OrcamentoConsolidado
  receita: PontoPrevisaoReceita[]
  despesa: PontoPrevisaoDespesa[]
  caixa: FluxoDeCaixa
  forecast: ForecastPrevisao
  centrosCusto: DetalheCentroCusto[]
  /** Despesa por categoria no período, do maior para o menor. */
  despesaPorCategoria: Array<{ id: string; nome: string; valor: number }>
}

/**
 * TUDO o que a Visão Geral da Previsão mostra, numa chamada.
 *
 * As consultas rodam em paralelo. A alternativa — cada bloco da tela buscando
 * o seu — faria seis requisições em cascata e deixaria a tela montando aos
 * pedaços, além de abrir a porta para dois blocos lerem janelas diferentes.
 */
export async function visaoGeralPrevisao(
  f: FiltroPrevisao = {}, hoje: Date = new Date(),
): Promise<VisaoGeralPrevisao> {
  const periodo = f.periodo ?? mesDe(hoje)
  const meses = f.meses ?? 1
  const periodos = periodosDaJanela(periodo, meses)
  const { inicio, fim } = janelaDatas(periodos)

  const [orcamento, receita, despesa, caixa, forecast, centrosCusto, categorias] =
    await Promise.all([
      orcamentoVsRealizado({ ...f, periodo, meses }, hoje),
      receitaPrevistaVsRealizada(periodos, f),
      despesaPrevistaVsRealizada(periodos, f),
      fluxoDeCaixa(periodos, f, hoje),
      forecastPrevisao(f, 3, 12, hoje),
      detalhePorCentroCusto({ ...f, periodo, meses }, hoje),
      prisma.lancamentoFinanceiro.groupBy({
        by: ['categoriaId'],
        where: {
          tipo: 'DESPESA',
          data: { gte: inicio, lt: fim },
          status: { not: 'CANCELADO' },
          ...(f.centroCustoId ? { centroCustoId: f.centroCustoId } : {}),
        },
        _sum: { valor: true },
      }),
    ])

  const nomes = categorias.length > 0
    ? await prisma.categoriaFinanceira.findMany({
        where: { id: { in: categorias.map((c) => c.categoriaId) } },
        select: { id: true, nome: true },
      })
    : []
  const nomeDe = new Map(nomes.map((n) => [n.id, n.nome]))

  return {
    periodo,
    periodos,
    meses,
    orcamento,
    receita,
    despesa,
    caixa,
    forecast,
    centrosCusto,
    despesaPorCategoria: categorias
      .map((c) => ({
        id: c.categoriaId,
        nome: nomeDe.get(c.categoriaId) ?? 'Sem categoria',
        valor: centavos(c._sum.valor ?? 0),
      }))
      .sort((a, b) => b.valor - a.valor),
  }
}

export { periodoEmCurso }

/* ========================================================================= *
 * O FILTRO, LIDO DA QUERY STRING
 * ========================================================================= */

/**
 * Interpreta os filtros globais da Previsão a partir da query string.
 *
 * ── UM LUGAR SÓ, PARA SETE ROTAS ────────────────────────────────────────
 *
 * Todas as rotas da Previsão aceitam os mesmos filtros. Interpretá-los em cada
 * handler faria sete cópias da mesma validação, livres para divergir — e a
 * primeira divergência apareceria como "o gráfico filtra por centro de custo
 * mas o KPI não".
 *
 * ── O QUE É RECUSADO, E O QUE É IGNORADO ────────────────────────────────
 *
 * PERÍODO em formato errado e JANELA fora do conjunto são RECUSADOS: cair no
 * padrão em silêncio faria a tela mostrar o mês corrente enquanto o controle
 * diz "trimestre", sem ninguém perceber.
 *
 * Os filtros de ENTIDADE (centro de custo, categoria, fornecedor, parceiro)
 * são ignorados quando vazios — "todos" é o estado natural de um filtro, não
 * um erro. Um id inexistente simplesmente não casa com nada e devolve lista
 * vazia, que é a resposta correta.
 */
export function filtroDaQuery(
  params: URLSearchParams,
): { filtro: FiltroPrevisao } | { erro: string } {
  const periodo = params.get('periodo')
  if (periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return { erro: 'Período inválido. Use YYYY-MM.' }
  }

  const mesesBruto = params.get('meses')
  let meses: number | undefined
  if (mesesBruto !== null) {
    const n = Number(mesesBruto)
    if (!(JANELAS_MESES as readonly number[]).includes(n)) {
      return {
        erro: `Janela inválida. Use ${JANELAS_MESES.join(', ')} (mês, trimestre, ano).`,
      }
    }
    meses = n
  }

  const tipoBruto = params.get('tipo')
  if (tipoBruto && tipoBruto !== 'RECEITA' && tipoBruto !== 'DESPESA') {
    return { erro: 'Tipo inválido. Use RECEITA ou DESPESA.' }
  }

  const texto = (k: string) => params.get(k)?.trim() || undefined

  return {
    filtro: {
      periodo: periodo ?? undefined,
      meses,
      tipo: (tipoBruto as TipoPrevisao | null) ?? undefined,
      centroCustoId: texto('centroCustoId'),
      categoriaId: texto('categoriaId'),
      fornecedorId: texto('fornecedorId'),
      condicaoId: texto('condicaoId'),
    },
  }
}

/* ========================================================================= *
 * OPÇÕES DOS FILTROS
 * ========================================================================= */

export interface OpcoesFiltroPrevisao {
  centrosCusto: Array<{ id: string; nome: string }>
  categorias: Array<{ id: string; nome: string; tipo: string }>
  fornecedores: Array<{ id: string; nome: string }>
  parceiros: Array<{ id: string; nome: string }>
}

/**
 * O que os seletores de filtro oferecem.
 *
 * ── SÓ O QUE ESTÁ ATIVO ─────────────────────────────────────────────────
 *
 * Centro de custo, categoria, fornecedor e parceiro INATIVOS ficam fora. Um
 * filtro que oferece uma área desativada produz lista vazia e manda a pessoa
 * procurar um problema que não existe — e o cadastro foi desativado
 * justamente para sair de circulação.
 *
 * O histórico NÃO é afetado: um lançamento classificado num centro de custo
 * depois inativado continua somando em todos os indicadores. O que sai é a
 * OFERTA no seletor, não o dado.
 *
 * ── UMA FUNÇÃO, SETE PÁGINAS ────────────────────────────────────────────
 *
 * Todas as áreas da Previsão usam os mesmos seletores. Quatro consultas
 * repetidas em sete páginas seriam 28 lugares para a lista divergir — e a
 * primeira divergência apareceria como "o filtro de Orçamento mostra uma área
 * que o de Despesas não mostra".
 */
export async function opcoesDeFiltro(): Promise<OpcoesFiltroPrevisao> {
  const [centros, categorias, fornecedores, parceiros] = await Promise.all([
    prisma.centroCusto.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
    prisma.categoriaFinanceira.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, tipo: true },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    }),
    prisma.fornecedor.findMany({
      where: { ativo: true },
      select: { id: true, razaoSocial: true },
      orderBy: { razaoSocial: 'asc' },
    }),
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: { id: true, nomeFantasia: true },
      orderBy: { nomeFantasia: 'asc' },
    }),
  ])

  return {
    centrosCusto: centros,
    categorias,
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.razaoSocial })),
    parceiros: parceiros.map((p) => ({ id: p.id, nome: p.nomeFantasia })),
  }
}

/**
 * Lê os filtros de `searchParams` de uma PÁGINA (Server Component).
 *
 * As páginas recebem `searchParams` como objeto, não como `URLSearchParams`.
 * Esta função converte e delega a `filtroDaQuery`, para que a validação seja
 * a MESMA da API — uma segunda implementação aqui faria a página aceitar o
 * que a rota recusa, e a tela mostraria um recorte que nenhuma API devolve.
 *
 * Filtro inválido numa PÁGINA cai no padrão, em vez de recusar: a API responde
 * 400 porque quem a chama é código, e código precisa saber que errou. Aqui quem
 * chega é uma pessoa com uma URL colada ou editada à mão, e uma tela de erro
 * por causa de um parâmetro estranho é pior que o painel do mês corrente.
 */
export function filtroDaPagina(
  searchParams: Record<string, string | string[] | undefined>,
): FiltroPrevisao {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string') params.set(k, v)
    else if (Array.isArray(v) && v.length > 0) params.set(k, v[0])
  }
  const r = filtroDaQuery(params)
  return 'erro' in r ? {} : r.filtro
}
