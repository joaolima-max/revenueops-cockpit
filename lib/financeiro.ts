/**
 * FINANCEIRO — regras de negócio do ambiente. Uma fonte por número.
 *
 *   LancamentoFinanceiro  → Receita, Despesa, Resultado, Gasto por categoria,
 *                           Contas a Pagar, Receita por BaaS / White Label
 *   CondicaoComercial     → MRR, BaaS ativos, White Labels ativos
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
 * As parcelas que compõem o MRR, explícitas para que a tela possa mostrar de
 * onde vem cada real e ninguém precise confiar num total opaco.
 */
export interface Mrr {
  /** Sustentação dos BaaS ativos JÁ VIGENTES. Campo: CondicaoComercial.sustentacao (tipo BAAS). */
  sustentacaoBaas: number
  /** Sustentação dos White Labels ativos JÁ VIGENTES. Campo: CondicaoComercial.sustentacao (tipo WHITE_LABEL). */
  sustentacaoWhiteLabel: number
  /** Mensalidade de API dos BaaS e White Labels. Campo: CondicaoComercial.apiMensal. */
  apiMensalParceiros: number
  /**
   * Mensalidade de conta ativa dos parceiros — FORA DO TOTAL.
   *
   * O MRR passou a ser Mensalidades + Sustentação, e componente derivado de
   * conta ativa não entra: a quantidade de contas oscila com a operação do
   * parceiro, então embuti-la fazia o recorrente subir e descer sem que
   * nenhum contrato tivesse mudado.
   *
   * O número continua exposto porque a tela precisa poder dizer que ele
   * existe e está de fora — some-lo em silêncio é o que se quer evitar.
   * Campo: CondicaoComercial.mensalidadeContaAtiva.
   */
  mensalidadeContaAtiva: number
  /** Mensalidade de API dos clientes da Carteira. Campo: Cliente.mensalidadeApi (status ATIVO). */
  apiMensalCarteira: number
  /** Soma das parcelas acima. */
  total: number
  /**
   * Parceiros ativos cuja sustentação ainda NÃO começou (data de início no
   * futuro). Não entram no total — e a tela precisa poder dizer isso, senão o
   * número parece simplesmente faltar.
   */
  sustentacaoAguardandoInicio: number
}

/** Último instante do mês "YYYY-MM". Referência de vigência da sustentação. */
function fimDoPeriodo(periodo?: string): Date {
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return new Date()
  return new Date(intervaloMes(periodo).fim.getTime() - 1)
}

/** A sustentação do parceiro já está vigente na data de referência? */
export function sustentacaoVigente(
  inicio: Date | null | undefined, referencia: Date,
): boolean {
  if (!inicio) return true
  return inicio.getTime() <= referencia.getTime()
}

/**
 * MRR pelas condições ATUAIS.
 *
 * REGRA:
 *   MRR = MENSALIDADES + SUSTENTAÇÃO
 *
 *   Mensalidades = API dos BaaS/White Labels + API dos clientes da Carteira
 *   Sustentação  = dos BaaS e White Labels já vigentes
 *
 * CONTA ATIVA NÃO ENTRA. `mensalidadeContaAtiva` fazia parte do total e saiu:
 * a quantidade de contas de um parceiro oscila com a operação dele, então o
 * recorrente subia e descia sem nenhum contrato ter mudado — e um MRR que se
 * move sozinho não serve para comparar mês a mês. O valor continua calculado
 * e devolvido, marcado como fora do total, para a tela poder dizer isso.
 *
 * DATA DE INÍCIO DA SUSTENTAÇÃO: um parceiro em implantação já está cadastrado
 * e ativo, mas ainda não paga sustentação. `sustentacaoInicio` no futuro mantém
 * a parcela FORA do MRR até a data chegar — sem isso o recorrente contaria
 * dinheiro que ainda não é cobrado.
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
export async function calcularMrr(periodo?: string): Promise<Mrr> {
  const referencia = fimDoPeriodo(periodo)

  const [parceiros, carteira] = await Promise.all([
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: {
        tipo: true, sustentacao: true, apiMensal: true,
        mensalidadeContaAtiva: true, sustentacaoInicio: true,
      },
    }),
    prisma.cliente.aggregate({
      where: { status: 'ATIVO' },
      _sum: { mensalidadeApi: true },
    }),
  ])

  let sustentacaoBaas = 0
  let sustentacaoWhiteLabel = 0
  let apiMensalParceiros = 0
  let mensalidadeContaAtiva = 0
  let sustentacaoAguardandoInicio = 0

  for (const p of parceiros) {
    const sust = p.sustentacao ?? 0
    if (sustentacaoVigente(p.sustentacaoInicio, referencia)) {
      if (p.tipo === 'BAAS') sustentacaoBaas += sust
      else sustentacaoWhiteLabel += sust
    } else {
      sustentacaoAguardandoInicio += sust
    }
    apiMensalParceiros += p.apiMensal ?? 0
    mensalidadeContaAtiva += p.mensalidadeContaAtiva ?? 0
  }

  const apiMensalCarteira = carteira._sum.mensalidadeApi ?? 0

  return {
    sustentacaoBaas,
    sustentacaoWhiteLabel,
    apiMensalParceiros,
    mensalidadeContaAtiva,
    apiMensalCarteira,
    sustentacaoAguardandoInicio,
    // MENSALIDADES + SUSTENTAÇÃO. `mensalidadeContaAtiva` fica fora.
    total:
      sustentacaoBaas + sustentacaoWhiteLabel +
      apiMensalParceiros + apiMensalCarteira,
  }
}

/** As duas parcelas do MRR, para a tela mostrar de onde vem o total. */
export function parcelasDoMrr(m: Mrr): { mensalidades: number; sustentacao: number } {
  return {
    mensalidades: m.apiMensalParceiros + m.apiMensalCarteira,
    sustentacao: m.sustentacaoBaas + m.sustentacaoWhiteLabel,
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
 * Mesma função serve Cockpit e Conselho. Não existe uma segunda consulta em
 * nenhum desses lugares.
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
 * RECEITA POR NATUREZA — Float, Setup, Sustentação
 * ========================================================================= */

export type Natureza = 'FLOAT' | 'SETUP' | 'SUSTENTACAO'

export type ReceitaPorNatureza = Record<Natureza, number>

/**
 * Receita LANÇADA em cada uma das três naturezas reconhecidas.
 *
 * A fonte é a CATEGORIA do lançamento, não o nome digitado: `natureza` é um
 * campo de CategoriaFinanceira, então renomear a categoria não quebra o
 * gráfico, e duas categorias podem compartilhar a mesma natureza.
 *
 * Zero significa "nada lançado nessa natureza no período" — é a informação que
 * permite às demais telas decidir se usam o valor lançado ou o derivado do
 * cadastro, sem contar as duas coisas.
 */
export async function receitaPorNatureza(periodo: string): Promise<ReceitaPorNatureza> {
  const { inicio, fim } = intervaloMes(periodo)

  const grupos = await prisma.lancamentoFinanceiro.groupBy({
    by: ['categoriaId'],
    where: {
      tipo: 'RECEITA',
      data: { gte: inicio, lt: fim },
      status: { not: 'CANCELADO' },
      categoria: { natureza: { not: null } },
    },
    _sum: { valor: true },
  })

  const zero: ReceitaPorNatureza = { FLOAT: 0, SETUP: 0, SUSTENTACAO: 0 }
  if (grupos.length === 0) return zero

  const categorias = await prisma.categoriaFinanceira.findMany({
    where: { id: { in: grupos.map((g) => g.categoriaId) } },
    select: { id: true, natureza: true },
  })
  const naturezaDe = new Map(categorias.map((c) => [c.id, c.natureza]))

  for (const g of grupos) {
    const n = naturezaDe.get(g.categoriaId)
    if (n) zero[n] += g._sum.valor ?? 0
  }
  return zero
}

/* ========================================================================= *
 * EVOLUÇÃO DE PARCEIROS ATIVOS — BaaS e White Label, mês a mês
 * ========================================================================= */

export interface PontoParceiros {
  periodo: string
  baasAtivos: number
  whiteLabelsAtivos: number
}

/**
 * Quantos BaaS e White Labels estavam ATIVOS no fim de cada período.
 *
 * A série é RECONSTRUÍDA, não estimada. `CondicaoComercial` guarda só o estado
 * de hoje, mas toda mudança de `ativo` é gravada em
 * `CondicaoComercialHistorico` (campo `ativo`, "Sim" → "Não"). Então o estado
 * passado sai de: estado atual, desfazendo toda transição posterior à data
 * consultada — de trás para frente.
 *
 * O mesmo vale para `tipo`: um parceiro que mudou de White Label para BaaS
 * contava na outra coluna antes da mudança, e usar o tipo de hoje reescreveria
 * o passado.
 *
 * Parceiro cadastrado DEPOIS do fim do período não entra: ele não existia.
 *
 * Isto não inventa número nenhum — cada contagem é derivada de registros que
 * existem. O que a série não alcança são mudanças feitas antes de o histórico
 * passar a ser gravado; para esses meses, o estado reconstruído é o mais
 * antigo conhecido.
 */
export async function evolucaoParceiros(periodos: string[]): Promise<PontoParceiros[]> {
  const [condicoes, transicoes] = await Promise.all([
    prisma.condicaoComercial.findMany({
      select: { id: true, tipo: true, ativo: true, createdAt: true },
    }),
    prisma.condicaoComercialHistorico.findMany({
      where: { campo: { in: ['ativo', 'tipo'] } },
      select: { condicaoId: true, campo: true, valorAnterior: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Estado de hoje, que é o ponto de partida do rebobinar.
  const estado = new Map(
    condicoes.map((c) => [c.id, { tipo: c.tipo as string, ativo: c.ativo, criadoEm: c.createdAt }]),
  )

  return periodos.map((periodo) => {
    const referencia = fimDoPeriodo(periodo)

    // Rebobina: desfaz toda transição POSTERIOR à referência. As transições
    // vêm em ordem decrescente, então aplicar `valorAnterior` em sequência
    // devolve o estado que valia na data.
    const naData = new Map(
      [...estado.entries()].map(([id, e]) => [id, { ...e }]),
    )
    for (const t of transicoes) {
      if (t.createdAt.getTime() <= referencia.getTime()) break
      const e = naData.get(t.condicaoId)
      if (!e) continue
      if (t.campo === 'ativo') e.ativo = t.valorAnterior === 'Sim'
      else if (t.campo === 'tipo' && t.valorAnterior) e.tipo = t.valorAnterior
    }

    let baasAtivos = 0
    let whiteLabelsAtivos = 0
    for (const e of naData.values()) {
      // Não existia ainda: não conta.
      if (e.criadoEm.getTime() > referencia.getTime()) continue
      if (!e.ativo) continue
      if (e.tipo === 'BAAS') baasAtivos += 1
      else whiteLabelsAtivos += 1
    }

    return { periodo, baasAtivos, whiteLabelsAtivos }
  })
}

/* ========================================================================= *
 * RECEITA POR PARCEIRO — BaaS e White Label
 * ========================================================================= */

export interface ReceitaParceiro {
  id: string
  nomeFantasia: string
  identificacao: string
  tipo: 'BAAS' | 'WHITE_LABEL'
  /** Soma dos lançamentos de receita vinculados a este parceiro no período. */
  lancado: number
  /** Mensalidades do cadastro que ainda não foram lançadas como receita. */
  recorrente: number
  /** lancado + recorrente. */
  total: number
  /** Quantos lançamentos sustentam a parcela `lancado` — a rastreabilidade. */
  lancamentos: number
}

/**
 * Receita por BaaS / White Label do período.
 *
 * DUAS ORIGENS, SEM DUPLA CONTAGEM:
 *
 *   1. LANÇAMENTOS vinculados ao parceiro (`LancamentoFinanceiro.condicaoId`).
 *      É a parcela RASTREÁVEL: cada real aqui tem um lançamento com data,
 *      categoria, status e anexos por trás.
 *
 *   2. MENSALIDADES do cadastro (sustentação vigente, API mensal, mensalidade
 *      de conta ativa) — o recorrente contratado, que nem sempre é lançado
 *      linha a linha.
 *
 * A regra que evita contar duas vezes: se existir lançamento de natureza
 * SUSTENTACAO vinculado ao parceiro no período, a sustentação do CADASTRO sai
 * da parcela recorrente — o valor lançado é a verdade, e o cadastro vira
 * apenas o contrato de referência.
 *
 * O vínculo é fotografado no lançamento: alterar a condição comercial do
 * parceiro amanhã não reescreve a receita já atribuída a ele ontem.
 */
export async function receitaPorParceiro(periodo: string): Promise<ReceitaParceiro[]> {
  const { inicio, fim } = intervaloMes(periodo)
  const referencia = fimDoPeriodo(periodo)

  const [parceiros, vinculados] = await Promise.all([
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: {
        id: true, nomeFantasia: true, identificacao: true, tipo: true,
        sustentacao: true, apiMensal: true, mensalidadeContaAtiva: true,
        sustentacaoInicio: true,
      },
      orderBy: { nomeFantasia: 'asc' },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: {
        tipo: 'RECEITA',
        condicaoId: { not: null },
        data: { gte: inicio, lt: fim },
        status: { not: 'CANCELADO' },
      },
      select: { condicaoId: true, valor: true, categoria: { select: { natureza: true } } },
    }),
  ])

  const porParceiro = new Map<string, { total: number; sustentacao: number; linhas: number }>()
  for (const l of vinculados) {
    if (!l.condicaoId) continue
    const atual = porParceiro.get(l.condicaoId) ?? { total: 0, sustentacao: 0, linhas: 0 }
    atual.total += l.valor
    atual.linhas += 1
    if (l.categoria.natureza === 'SUSTENTACAO') atual.sustentacao += l.valor
    porParceiro.set(l.condicaoId, atual)
  }

  return parceiros
    .map((p) => {
      const lanc = porParceiro.get(p.id) ?? { total: 0, sustentacao: 0, linhas: 0 }
      const sust = sustentacaoVigente(p.sustentacaoInicio, referencia) ? (p.sustentacao ?? 0) : 0
      // Sustentação lançada substitui a do cadastro — nunca somam.
      // Conta ativa fora, pela mesma regra do MRR: o recorrente do parceiro
      // precisa fechar com o recorrente da empresa, senão as duas telas
      // discordariam sobre o mesmo contrato.
      const recorrente = (lanc.sustentacao > 0 ? 0 : sust) + (p.apiMensal ?? 0)

      return {
        id: p.id,
        nomeFantasia: p.nomeFantasia,
        identificacao: p.identificacao,
        tipo: p.tipo,
        lancado: lanc.total,
        recorrente,
        total: lanc.total + recorrente,
        lancamentos: lanc.linhas,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/* ========================================================================= *
 * CONTAS A PAGAR
 * ========================================================================= */

export type SituacaoPagar = 'PAGA' | 'VENCIDA' | 'A_VENCER' | 'CANCELADA'

export interface TituloPagar {
  id: string
  descricao: string
  valor: number
  /** Data em que a despesa foi lançada (competência). */
  data: string
  /** Data em que a despesa vence. Nunca nula em Contas a Pagar. */
  dataVencimento: string
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO'
  situacao: SituacaoPagar
  /** Dias até o vencimento; negativo quando já venceu. Null quando paga. */
  diasParaVencer: number | null
  categoria: { id: string; nome: string }
  fornecedor: { id: string; razaoSocial: string } | null
  parcela: number | null
  totalParcelas: number | null
}

export interface ResumoPagar {
  total: number
  pagas: number
  pendentes: number
  vencidas: number
  aVencer: number
  titulos: number
}

const DIA_MS = 86_400_000

/** Meia-noite UTC do dia informado — o grão das colunas DATE. */
function diaUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Situação de um título a pagar. Função pura para ser exercitável sem banco —
 * é ela que decide o que aparece como "vencido" na tela.
 *
 * PAGO ganha de tudo: um título pago depois do vencimento não é "vencido", é
 * pago. CANCELADO idem — é despesa que não aconteceu.
 */
export function situacaoDoTitulo(
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO',
  vencimento: Date,
  hoje: Date = new Date(),
): { situacao: SituacaoPagar; diasParaVencer: number | null } {
  if (status === 'PAGO') return { situacao: 'PAGA', diasParaVencer: null }
  if (status === 'CANCELADO') return { situacao: 'CANCELADA', diasParaVencer: null }

  const dias = Math.round((diaUtc(vencimento) - diaUtc(hoje)) / DIA_MS)
  return { situacao: dias < 0 ? 'VENCIDA' : 'A_VENCER', diasParaVencer: dias }
}

export interface FiltroPagar {
  periodo?: string
  situacao?: SituacaoPagar
  categoriaId?: string
  fornecedorId?: string
  descricao?: string
}

/**
 * Contas a Pagar — a MESMA base de Lançamentos, filtrada por tipo DESPESA.
 *
 * Não existe uma segunda tabela de despesas: o que muda aqui é a data de
 * referência (vencimento, não lançamento) e o recorte por situação. Uma
 * despesa editada em Lançamentos aparece corrigida aqui no mesmo instante,
 * porque é a mesma linha.
 */
export async function contasAPagar(
  filtro: FiltroPagar, hoje: Date = new Date(),
): Promise<{ titulos: TituloPagar[]; resumo: ResumoPagar }> {
  const janela = filtro.periodo && /^\d{4}-\d{2}$/.test(filtro.periodo)
    ? intervaloMes(filtro.periodo)
    : null

  const linhas = await prisma.lancamentoFinanceiro.findMany({
    where: {
      tipo: 'DESPESA',
      ...(janela ? { dataVencimento: { gte: janela.inicio, lt: janela.fim } } : {}),
      ...(filtro.categoriaId ? { categoriaId: filtro.categoriaId } : {}),
      ...(filtro.fornecedorId ? { fornecedorId: filtro.fornecedorId } : {}),
      ...(filtro.descricao
        ? { descricao: { contains: filtro.descricao, mode: 'insensitive' as const } }
        : {}),
    },
    include: {
      categoria: { select: { id: true, nome: true } },
      fornecedor: { select: { id: true, razaoSocial: true } },
    },
    orderBy: [{ dataVencimento: 'asc' }, { data: 'asc' }],
    take: 500,
  })

  const titulos: TituloPagar[] = linhas.map((l) => {
    // Despesas antigas, anteriores ao campo, caem na data de lançamento — é a
    // única informação verdadeira que existe sobre elas.
    const venc = l.dataVencimento ?? l.data
    const { situacao, diasParaVencer } = situacaoDoTitulo(l.status, venc, hoje)
    return {
      id: l.id,
      descricao: l.descricao,
      valor: l.valor,
      data: l.data.toISOString().slice(0, 10),
      dataVencimento: venc.toISOString().slice(0, 10),
      status: l.status,
      situacao,
      diasParaVencer,
      categoria: l.categoria,
      fornecedor: l.fornecedor,
      parcela: l.parcela,
      totalParcelas: l.totalParcelas,
    }
  })

  const filtrados = filtro.situacao
    ? titulos.filter((t) => t.situacao === filtro.situacao)
    : titulos

  // O resumo descreve o CONJUNTO ANTES do filtro de situação: filtrar por
  // "vencidas" não pode fazer o total do mês mudar.
  const soma = (p: (t: TituloPagar) => boolean) =>
    titulos.filter(p).reduce((s, t) => s + t.valor, 0)

  return {
    titulos: filtrados,
    resumo: {
      total: soma((t) => t.situacao !== 'CANCELADA'),
      pagas: soma((t) => t.situacao === 'PAGA'),
      pendentes: soma((t) => t.situacao === 'VENCIDA' || t.situacao === 'A_VENCER'),
      vencidas: soma((t) => t.situacao === 'VENCIDA'),
      aVencer: soma((t) => t.situacao === 'A_VENCER'),
      titulos: filtrados.length,
    },
  }
}

/* ========================================================================= *
 * CONTAS A RECEBER
 *
 * Mesma GRAMÁTICA de Contas a Pagar — total, vencidas, a vencer, pagas — sobre
 * a base que é dela: `ContaReceber`, o faturamento do cliente. As duas telas
 * respondem à mesma pergunta em direções opostas, e por isso compartilham o
 * vocabulário de situação em vez de cada uma inventar o seu.
 *
 * O que NÃO é compartilhado é a origem: recebível é título do cliente, despesa
 * é lançamento de caixa. Unificar as duas tabelas criaria a segunda base que o
 * produto evita desde a v16.
 * ========================================================================= */

export type SituacaoReceber = 'PAGA' | 'VENCIDA' | 'A_VENCER'

export type StatusContaReceber = 'PENDENTE' | 'FATURADO' | 'PAGO' | 'INADIMPLENTE'

export interface TituloReceber {
  id: string
  descricao: string
  tipo: string
  valor: number
  dataVenc: string
  dataFatura: string | null
  dataPago: string | null
  status: StatusContaReceber
  situacao: SituacaoReceber
  /** Dias até o vencimento; negativo quando já venceu. Null quando paga. */
  diasParaVencer: number | null
  notas: string | null
  parcela: number | null
  totalParcel: number | null
  cliente: { id: string; nome: string; modeloOperacional: string }
}

export interface ResumoReceber {
  total: number
  pagas: number
  aReceber: number
  vencidas: number
  aVencer: number
  titulos: number
}

/**
 * Situação de um recebível. Função pura, espelho de `situacaoDoTitulo`.
 *
 * PAGO ganha de tudo: um título pago depois do vencimento é pago, não vencido.
 * INADIMPLENTE é vencido POR DECLARAÇÃO — alguém marcou assim —, e continua
 * vencido mesmo que a data ainda não tenha passado; é a única situação em que
 * o estado informado vale mais que o calendário.
 */
export function situacaoDoRecebivel(
  status: StatusContaReceber,
  vencimento: Date,
  hoje: Date = new Date(),
): { situacao: SituacaoReceber; diasParaVencer: number | null } {
  if (status === 'PAGO') return { situacao: 'PAGA', diasParaVencer: null }

  const dias = Math.round((diaUtc(vencimento) - diaUtc(hoje)) / DIA_MS)
  if (status === 'INADIMPLENTE') return { situacao: 'VENCIDA', diasParaVencer: dias }
  return { situacao: dias < 0 ? 'VENCIDA' : 'A_VENCER', diasParaVencer: dias }
}

export interface FiltroReceber {
  periodo?: string
  situacao?: SituacaoReceber
  status?: StatusContaReceber
  clienteId?: string
  descricao?: string
}

/** Contas a Receber — títulos de `ContaReceber`, pela data de vencimento. */
export async function contasAReceber(
  filtro: FiltroReceber, hoje: Date = new Date(),
): Promise<{ titulos: TituloReceber[]; resumo: ResumoReceber }> {
  const janela = filtro.periodo && /^\d{4}-\d{2}$/.test(filtro.periodo)
    ? intervaloMes(filtro.periodo)
    : null

  const linhas = await prisma.contaReceber.findMany({
    where: {
      ...(janela ? { dataVenc: { gte: janela.inicio, lt: janela.fim } } : {}),
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.descricao
        ? { descricao: { contains: filtro.descricao, mode: 'insensitive' as const } }
        : {}),
    },
    include: { cliente: { select: { id: true, nome: true, modeloOperacional: true } } },
    orderBy: [{ dataVenc: 'asc' }],
    take: 500,
  })

  const titulos: TituloReceber[] = linhas.map((l) => {
    const { situacao, diasParaVencer } = situacaoDoRecebivel(l.status, l.dataVenc, hoje)
    return {
      id: l.id,
      descricao: l.descricao,
      tipo: l.tipo,
      valor: l.valor,
      dataVenc: l.dataVenc.toISOString().slice(0, 10),
      dataFatura: l.dataFatura ? l.dataFatura.toISOString().slice(0, 10) : null,
      dataPago: l.dataPago ? l.dataPago.toISOString().slice(0, 10) : null,
      status: l.status,
      situacao,
      diasParaVencer,
      notas: l.notas,
      parcela: l.parcela,
      totalParcel: l.totalParcel,
      cliente: l.cliente,
    }
  })

  const filtrados = filtro.situacao
    ? titulos.filter((t) => t.situacao === filtro.situacao)
    : titulos

  // O resumo descreve o CONJUNTO ANTES do filtro de situação: filtrar por
  // "vencidas" não pode fazer o total do mês mudar.
  const soma = (p: (t: TituloReceber) => boolean) =>
    titulos.filter(p).reduce((s, t) => s + t.valor, 0)

  return {
    titulos: filtrados,
    resumo: {
      total: soma(() => true),
      pagas: soma((t) => t.situacao === 'PAGA'),
      aReceber: soma((t) => t.situacao !== 'PAGA'),
      vencidas: soma((t) => t.situacao === 'VENCIDA'),
      aVencer: soma((t) => t.situacao === 'A_VENCER'),
      titulos: filtrados.length,
    },
  }
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
 * EVOLUÇÃO TEMPORAL
 * ========================================================================= */

export interface PontoEvolucao {
  periodo: string
  receita: number
  despesa: number
  resultado: number
}

/**
 * Receita, despesa e resultado mês a mês. UMA consulta para toda a série — a
 * alternativa (N chamadas a `resultadoDoPeriodo`) faria N×2 idas ao banco só
 * para desenhar um gráfico.
 */
export async function evolucaoFinanceira(periodos: string[]): Promise<PontoEvolucao[]> {
  if (periodos.length === 0) return []

  const inicio = intervaloMes(periodos[0]).inicio
  const fim = intervaloMes(periodos[periodos.length - 1]).fim

  const linhas = await prisma.lancamentoFinanceiro.findMany({
    where: { data: { gte: inicio, lt: fim }, status: { not: 'CANCELADO' } },
    select: { tipo: true, valor: true, data: true },
  })

  const acumulado = new Map<string, { receita: number; despesa: number }>()
  for (const l of linhas) {
    const chave = `${l.data.getUTCFullYear()}-${String(l.data.getUTCMonth() + 1).padStart(2, '0')}`
    const atual = acumulado.get(chave) ?? { receita: 0, despesa: 0 }
    if (l.tipo === 'RECEITA') atual.receita += l.valor
    else atual.despesa += l.valor
    acumulado.set(chave, atual)
  }

  return periodos.map((p) => {
    const a = acumulado.get(p) ?? { receita: 0, despesa: 0 }
    return { periodo: p, receita: a.receita, despesa: a.despesa, resultado: a.receita - a.despesa }
  })
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
  receitaPorBaas: ReceitaParceiro[]
  receitaPorWhiteLabel: ReceitaParceiro[]
  porNatureza: ReceitaPorNatureza
  evolucao: PontoEvolucao[]
  contasAPagar: ResumoPagar
}

/** Tudo que a Visão Geral mostra. */
export async function visaoGeralFinanceiro(
  periodo: string, periodosSerie: string[] = [],
): Promise<VisaoGeralFinanceiro> {
  const [mrr, resultado, inadimplencia, gastos, parceiros, natureza, evolucao, pagar] =
    await Promise.all([
      calcularMrr(periodo),
      resultadoDoPeriodo(periodo),
      inadimplenciaDoPeriodo(periodo),
      gastoPorCategoria(periodo),
      receitaPorParceiro(periodo),
      receitaPorNatureza(periodo),
      evolucaoFinanceira(periodosSerie),
      contasAPagar({ periodo }),
    ])

  return {
    periodo,
    mrr,
    arr: arrDoMrr(mrr.total),
    resultado,
    inadimplencia,
    gastoPorCategoria: gastos,
    receitaPorBaas: parceiros.filter((p) => p.tipo === 'BAAS'),
    receitaPorWhiteLabel: parceiros.filter((p) => p.tipo === 'WHITE_LABEL'),
    porNatureza: natureza,
    evolucao,
    contasAPagar: pagar.resumo,
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
 * Horizonte de uma recorrência SEM data final.
 *
 * A recorrência indefinida não pede data ao usuário, mas alguma quantidade de
 * linhas precisa existir — o sistema materializa as linhas em vez de expandir
 * a recorrência na leitura (ver abaixo). Cinco anos cobre qualquer horizonte de
 * planejamento do produto e mantém o custo por cadastro trivial.
 */
export const MESES_RECORRENCIA_INDEFINIDA = 60

/** Teto de segurança para recorrência com data: 20 anos de linhas. */
export const MESES_RECORRENCIA_MAXIMO = 240

/** Quantos meses vão de `inicio` até o fim do mês de `fim`, inclusive. */
export function mesesEntre(inicio: Date, fim: Date): number {
  const meses =
    (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 +
    (fim.getUTCMonth() - inicio.getUTCMonth())
  return meses + 1
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
 *   RECORRENTE → 1 linha por mês, até `recorrenciaFim` quando houver data, ou
 *                até o horizonte de recorrência indefinida quando não houver
 */
export function expandirLancamento(
  periodicidade: 'UNICA' | 'RECORRENTE' | 'PARCELADA',
  data: Date,
  valor: number,
  opcoes: { totalParcelas?: number | null; recorrenciaFim?: Date | null } = {},
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
    const n = opcoes.recorrenciaFim
      ? Math.min(MESES_RECORRENCIA_MAXIMO, Math.max(1, mesesEntre(data, opcoes.recorrenciaFim)))
      : MESES_RECORRENCIA_INDEFINIDA
    return Array.from({ length: n }, (_, i) => ({
      data: somarMeses(data, i),
      valor,
      parcela: null,
      totalParcelas: null,
    }))
  }

  return [{ data, valor, parcela: null, totalParcelas: null }]
}
