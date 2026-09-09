/**
 * VOLUMETRIA MINIMA POR CLIENTE — exigencia contratual/comercial.
 *
 * Um contrato de volumetria diz: "o cliente X deve gerar no minimo N
 * transacoes por mes, de MM/AAAA ate MM/AAAA (ou por prazo indeterminado)".
 *
 * O que este modulo NAO faz, por decisao de produto:
 *   * nao guarda TPV nem realizado por cliente;
 *   * nao deriva atingimento por cliente.
 * O realizado continua vindo, sempre, de LancamentoDiario — que e global por
 * data. Por isso o unico atingimento possivel e o CONSOLIDADO do mes: soma dos
 * minimos vigentes x transacoes do periodo. Ver `volumetriaDoPeriodo` em
 * lib/kpi.ts.
 *
 * Periodos sao strings "YYYY-MM". A ordem lexicografica dessas strings e a
 * ordem cronologica, o que deixa as comparacoes de vigencia triviais.
 */

import { prisma } from '@/lib/prisma'

export type StatusContrato = 'VIGENTE' | 'PROGRAMADA' | 'ENCERRADA' | 'INATIVA'

export function periodoValido(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}$/.test(v)) return false
  const mes = Number(v.slice(5, 7))
  return mes >= 1 && mes <= 12
}

export function periodoAtual(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

interface Vigencia {
  periodo: string
  vigenciaFim: string | null
  ativo: boolean
}

/** O contrato esta valendo no mes informado? Contratos inativos nunca valem. */
export function cobrePeriodo(c: Vigencia, periodo: string): boolean {
  if (!c.ativo) return false
  if (c.periodo > periodo) return false
  return c.vigenciaFim === null || c.vigenciaFim >= periodo
}

export function statusContrato(c: Vigencia, ref = periodoAtual()): StatusContrato {
  if (!c.ativo) return 'INATIVA'
  if (c.periodo > ref) return 'PROGRAMADA'
  if (c.vigenciaFim !== null && c.vigenciaFim < ref) return 'ENCERRADA'
  return 'VIGENTE'
}

/** Duas vigencias ativas do mesmo cliente se sobrepoem? */
export function vigenciasSobrepoem(a: Vigencia, b: Vigencia): boolean {
  const aFim = a.vigenciaFim ?? '9999-12'
  const bFim = b.vigenciaFim ?? '9999-12'
  return a.periodo <= bFim && b.periodo <= aFim
}

export interface ContratoVolumetria {
  id: string
  clienteId: string | null
  clienteNome: string | null
  qtdMinima: number
  vigenciaInicio: string
  vigenciaFim: string | null
  ativo: boolean
  notas: string | null
  status: StatusContrato
  legado: boolean
  createdAt: Date
  updatedAt: Date
}

type LinhaCrua = {
  id: string
  clienteId: string | null
  periodo: string
  vigenciaFim: string | null
  qtdMinima: number
  ativo: boolean
  notas: string | null
  createdAt: Date
  updatedAt: Date
  cliente: { nome: string } | null
}

function paraContrato(r: LinhaCrua, ref: string): ContratoVolumetria {
  const legado = r.clienteId === null
  // Contrato geral legado valia por UM mes, nao por vigencia aberta. Fechar a
  // vigencia nele aqui mantem a tela e `minimoContratadoDoPeriodo` contando a
  // mesma coisa — senao uma linha de 2025 apareceria como vigente para sempre.
  const vigenciaFim = legado ? r.periodo : r.vigenciaFim

  return {
    id: r.id,
    clienteId: r.clienteId,
    clienteNome: r.cliente?.nome ?? null,
    qtdMinima: r.qtdMinima,
    vigenciaInicio: r.periodo,
    vigenciaFim,
    ativo: r.ativo,
    notas: r.notas,
    status: statusContrato({ ...r, vigenciaFim }, ref),
    legado,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export interface FiltroContratos {
  clienteId?: string
  /** Só contratos cuja vigência cobre este mês. */
  periodo?: string
  /** Busca pelo nome do cliente. */
  search?: string
  status?: StatusContrato
  /** Inclui os contratos gerais legados (clienteId nulo). Padrão: inclui. */
  incluirLegado?: boolean
}

/**
 * Historico de contratos, ordenado por cliente e, dentro de cada cliente, da
 * vigencia mais recente para a mais antiga — que e como a tela le "historico
 * por cliente".
 */
export async function listarContratos(f: FiltroContratos = {}): Promise<ContratoVolumetria[]> {
  const ref = periodoAtual()

  const linhas = await prisma.volumetriaMinima.findMany({
    where: {
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(f.incluirLegado === false ? { clienteId: { not: null } } : {}),
      ...(f.search ? { cliente: { nome: { contains: f.search, mode: 'insensitive' } } } : {}),
    },
    include: { cliente: { select: { nome: true } } },
    orderBy: [{ periodo: 'desc' }],
  })

  let contratos = linhas.map((l) => paraContrato(l, ref))

  if (f.periodo) contratos = contratos.filter((c) => cobrePeriodo({ periodo: c.vigenciaInicio, vigenciaFim: c.vigenciaFim, ativo: c.ativo }, f.periodo!))
  if (f.status) contratos = contratos.filter((c) => c.status === f.status)

  return contratos.sort((a, b) => {
    const na = a.clienteNome ?? '￿'
    const nb = b.clienteNome ?? '￿'
    if (na !== nb) return na.localeCompare(nb, 'pt-BR')
    return b.vigenciaInicio.localeCompare(a.vigenciaInicio)
  })
}

export interface MinimoConsolidado {
  qtdMinima: number
  /** Quantos contratos de cliente compoem o minimo. */
  clientes: number
  origem: 'CLIENTES' | 'GERAL_LEGADO'
}

/**
 * Minimo contratado de um mes.
 *
 * Prioridade para os contratos por cliente vigentes no mes. Se nenhum cobrir o
 * periodo — o caso dos meses fechados antes desta funcionalidade — cai no
 * contrato geral legado, para que os alertas historicos nao mudem de resposta.
 * Retorna null quando nao ha contrato nenhum: ausencia de dado, nunca zero.
 */
export async function minimoContratadoDoPeriodo(periodo: string): Promise<MinimoConsolidado | null> {
  const linhas = await prisma.volumetriaMinima.findMany({
    where: { ativo: true, periodo: { lte: periodo } },
    select: { clienteId: true, periodo: true, vigenciaFim: true, qtdMinima: true, ativo: true },
  })

  const vigentes = linhas.filter((l) => cobrePeriodo(l, periodo))

  const porCliente = vigentes.filter((l) => l.clienteId !== null)
  if (porCliente.length > 0) {
    return {
      qtdMinima: porCliente.reduce((s, l) => s + l.qtdMinima, 0),
      clientes: new Set(porCliente.map((l) => l.clienteId)).size,
      origem: 'CLIENTES',
    }
  }

  const legado = vigentes.find((l) => l.clienteId === null && l.periodo === periodo)
  if (legado) return { qtdMinima: legado.qtdMinima, clientes: 0, origem: 'GERAL_LEGADO' }

  return null
}

/**
 * Uma nova vigencia ativa nao pode se sobrepor a outra do mesmo cliente: duas
 * exigencias validas no mesmo mes tornariam a soma consolidada uma cobranca
 * dupla do mesmo contrato.
 */
export async function conflitoDeVigencia(
  clienteId: string,
  vigencia: Vigencia,
  ignorarId?: string,
): Promise<ContratoVolumetria | null> {
  if (!vigencia.ativo) return null

  const linhas = await prisma.volumetriaMinima.findMany({
    where: { clienteId, ativo: true, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    include: { cliente: { select: { nome: true } } },
  })

  const conflito = linhas.find((l) => vigenciasSobrepoem(l, vigencia))
  return conflito ? paraContrato(conflito, periodoAtual()) : null
}
