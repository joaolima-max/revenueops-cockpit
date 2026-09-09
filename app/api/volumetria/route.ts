import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { volumetriaDoPeriodo } from '@/lib/kpi'
import {
  listarContratos, conflitoDeVigencia, periodoValido, periodoAtual,
  type StatusContrato,
} from '@/lib/volumetria'

const STATUS: StatusContrato[] = ['VIGENTE', 'PROGRAMADA', 'ENCERRADA', 'INATIVA']

/** Escrita segue a regra que já existia: COMERCIAL não configura volumetria. */
function podeGerenciar(role: string): boolean {
  return role !== 'COMERCIAL'
}

/**
 * Contratos de volumetria mínima por cliente + o consolidado do período de
 * referência (soma dos vigentes × transações realizadas).
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const periodo = sp.get('periodo') || periodoAtual()
  if (!periodoValido(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const statusParam = sp.get('status') || ''
  const status = STATUS.includes(statusParam as StatusContrato) ? (statusParam as StatusContrato) : undefined

  const [contratos, consolidado] = await Promise.all([
    listarContratos({
      clienteId: sp.get('clienteId') || undefined,
      search: sp.get('search') || undefined,
      periodo: sp.get('vigentesEm') || undefined,
      status,
    }),
    volumetriaDoPeriodo(periodo),
  ])

  return NextResponse.json({ periodo, contratos, consolidado })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { clienteId, qtdMinima, vigenciaInicio, vigenciaFim, notas } = await request.json()

  if (!clienteId || typeof clienteId !== 'string') {
    return NextResponse.json({ error: 'Selecione um cliente cadastrado.' }, { status: 400 })
  }
  if (!periodoValido(vigenciaInicio)) {
    return NextResponse.json({ error: 'Início da vigência inválido. Use YYYY-MM.' }, { status: 400 })
  }
  const fim = vigenciaFim ? String(vigenciaFim) : null
  if (fim !== null && !periodoValido(fim)) {
    return NextResponse.json({ error: 'Fim da vigência inválido. Use YYYY-MM.' }, { status: 400 })
  }
  if (fim !== null && fim < vigenciaInicio) {
    return NextResponse.json({ error: 'O fim da vigência não pode ser anterior ao início.' }, { status: 400 })
  }

  const n = Math.round(Number(qtdMinima))
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: 'A quantidade mínima deve ser um número maior que zero.' }, { status: 400 })
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nome: true } })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  const conflito = await conflitoDeVigencia(clienteId, {
    periodo: vigenciaInicio, vigenciaFim: fim, ativo: true,
  })
  if (conflito) {
    return NextResponse.json({
      error: `Já existe configuração ativa para ${cliente.nome} cobrindo esse intervalo (a partir de ${conflito.vigenciaInicio}${conflito.vigenciaFim ? ` até ${conflito.vigenciaFim}` : ', por prazo indeterminado'}). Encerre ou inative a anterior antes de criar uma nova.`,
    }, { status: 409 })
  }

  const registro = await prisma.volumetriaMinima.create({
    data: {
      clienteId,
      periodo: vigenciaInicio,
      vigenciaFim: fim,
      qtdMinima: n,
      notas: notas ? String(notas).slice(0, 500) : null,
    },
  })

  await logAudit(
    session.userId, 'CRIOU_VOLUMETRIA', 'VolumetriaMinima', registro.id,
    `${cliente.nome}: mínimo ${n} transações a partir de ${vigenciaInicio}${fim ? ` até ${fim}` : ''}`,
  )

  return NextResponse.json({ contrato: registro }, { status: 201 })
}
