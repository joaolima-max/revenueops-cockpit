import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { notificar } from '@/lib/notificacoes'
import { MOTIVOS, STATUS, CRITICIDADES, type Motivo, type Status, type Criticidade } from '@/lib/compliance'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_compliance', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const status = sp.get('status')
  const motivo = sp.get('motivo')

  const pendencias = await prisma.pendenciaCompliance.findMany({
    where: {
      ...(sp.get('clienteId') ? { clienteId: sp.get('clienteId')! } : {}),
      ...(STATUS.includes(status as Status) ? { status: status as Status } : {}),
      ...(MOTIVOS.includes(motivo as Motivo) ? { motivo: motivo as Motivo } : {}),
      ...(sp.get('minhas') === '1' ? { responsavelId: session.userId } : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      _count: { select: { eventos: true } },
    },
    orderBy: [{ status: 'asc' }, { prazo: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  })

  return NextResponse.json({ pendencias })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_compliance', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { clienteId, motivo, criticidade, titulo, observacoes, prazo, responsavelId } = await request.json()

  if (!clienteId) return NextResponse.json({ error: 'Selecione o cliente.' }, { status: 400 })
  if (!MOTIVOS.includes(motivo)) return NextResponse.json({ error: 'Motivo inválido.' }, { status: 400 })
  if (!String(titulo ?? '').trim()) return NextResponse.json({ error: 'Informe o título da pendência.' }, { status: 400 })
  if (!responsavelId) return NextResponse.json({ error: 'Escolha o responsável.' }, { status: 400 })

  const [cliente, responsavel] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } }),
    prisma.user.findUnique({ where: { id: responsavelId }, select: { id: true } }),
  ])
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  if (!responsavel) return NextResponse.json({ error: 'Responsável não encontrado.' }, { status: 404 })

  const crit: Criticidade = CRITICIDADES.includes(criticidade) ? criticidade : 'MEDIA'

  const pendencia = await prisma.$transaction(async (tx) => {
    const p = await tx.pendenciaCompliance.create({
      data: {
        clienteId,
        motivo,
        criticidade: crit,
        titulo: String(titulo).slice(0, 200),
        observacoes: observacoes ? String(observacoes).slice(0, 2000) : null,
        prazo: prazo ? new Date(prazo) : null,
        responsavelId,
      },
    })
    await tx.pendenciaEvento.create({
      data: { pendenciaId: p.id, userId: session.userId, statusPara: 'ABERTA', comentario: 'Pendência aberta.' },
    })
    return p
  })

  await logAudit(
    session.userId, 'ABRIU_PENDENCIA_COMPLIANCE', 'PendenciaCompliance', pendencia.id,
    `${cliente.nome} · ${titulo} (${crit})`,
  )

  if (responsavelId !== session.userId) {
    await notificar({
      destinatarioId: responsavelId,
      titulo: 'Nova pendência de compliance',
      mensagem: `${cliente.nome}: ${titulo}`,
      origem: 'COMPLIANCE',
      entidade: 'PendenciaCompliance',
      entidadeId: pendencia.id,
      href: '/dashboard/compliance',
    })
  }

  return NextResponse.json({ pendencia }, { status: 201 })
}
