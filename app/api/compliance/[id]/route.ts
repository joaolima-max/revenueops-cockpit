import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { notificar } from '@/lib/notificacoes'
import { transicaoValida, ehTerminal, STATUS, CRITICIDADES, type Status } from '@/lib/compliance'
import { PENDENCIA_STATUS_LABELS } from '@/lib/utils'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_compliance', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const pendencia = await prisma.pendenciaCompliance.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      eventos: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!pendencia) return NextResponse.json({ error: 'Pendência não encontrada' }, { status: 404 })

  // Documentos do cliente ficam à mão: resolver uma pendência quase sempre
  // passa por olhar o que já foi enviado.
  const documentos = await prisma.documento.findMany({
    where: { clienteId: pendencia.clienteId, ativo: true },
    select: { id: true, nome: true, categoria: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({ pendencia, documentos })
}

/** Muda status, responsável ou dados, sempre gravando um evento na timeline. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_compliance', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { status, comentario, responsavelId, criticidade, prazo, observacoes } = await request.json()

  const atual = await prisma.pendenciaCompliance.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Pendência não encontrada' }, { status: 404 })

  let novoStatus: Status | undefined
  if (status) {
    if (!STATUS.includes(status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    if (!transicaoValida(atual.status, status)) {
      return NextResponse.json({
        error: `Não é possível ir de ${PENDENCIA_STATUS_LABELS[atual.status]} para ${PENDENCIA_STATUS_LABELS[status]}.`,
      }, { status: 409 })
    }
    novoStatus = status
  }

  const pendencia = await prisma.$transaction(async (tx) => {
    const p = await tx.pendenciaCompliance.update({
      where: { id },
      data: {
        ...(novoStatus ? { status: novoStatus } : {}),
        ...(novoStatus && ehTerminal(novoStatus) ? { resolvidaEm: new Date() } : {}),
        ...(novoStatus && !ehTerminal(novoStatus) ? { resolvidaEm: null } : {}),
        ...(responsavelId ? { responsavelId } : {}),
        ...(criticidade && CRITICIDADES.includes(criticidade) ? { criticidade } : {}),
        ...(prazo !== undefined ? { prazo: prazo ? new Date(prazo) : null } : {}),
        ...(observacoes !== undefined ? { observacoes: observacoes ? String(observacoes).slice(0, 2000) : null } : {}),
      },
    })

    await tx.pendenciaEvento.create({
      data: {
        pendenciaId: id,
        userId: session.userId,
        statusDe: novoStatus ? atual.status : null,
        statusPara: novoStatus ?? null,
        comentario: comentario ? String(comentario).slice(0, 1000) : null,
      },
    })
    return p
  })

  await logAudit(
    session.userId, 'ATUALIZOU_PENDENCIA_COMPLIANCE', 'PendenciaCompliance', id,
    novoStatus
      ? `${atual.cliente.nome}: ${PENDENCIA_STATUS_LABELS[atual.status]} → ${PENDENCIA_STATUS_LABELS[novoStatus]}`
      : `${atual.cliente.nome}: dados atualizados`,
  )

  const avisar = responsavelId && responsavelId !== session.userId ? responsavelId : null
  if (avisar) {
    await notificar({
      destinatarioId: avisar,
      titulo: 'Pendência de compliance atribuída a você',
      mensagem: `${atual.cliente.nome}: ${atual.titulo}`,
      origem: 'COMPLIANCE',
      entidade: 'PendenciaCompliance',
      entidadeId: id,
      href: '/dashboard/compliance',
    })
  }

  return NextResponse.json({ pendencia })
}
