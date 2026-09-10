import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { validarDefinicao } from '@/lib/formularios'
import type { Prisma } from '@prisma/client'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const versao = await prisma.formularioVersao.findUnique({
    where: { id },
    include: {
      formulario: { select: { id: true, nome: true, ativo: true } },
      _count: { select: { respostas: true } },
    },
  })
  if (!versao) return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })

  return NextResponse.json({ versao })
}

/**
 * Salva a estrutura vinda do construtor.
 *
 * Uma versão publicada é IMUTÁVEL: se já houver resposta, editar cria a versão
 * seguinte em vez de reescrever a atual. É isso que impede uma alteração de
 * hoje de mudar o significado do que foi respondido ontem.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { definicao, publicar } = await request.json()

  const problema = validarDefinicao(definicao)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const atual = await prisma.formularioVersao.findUnique({
    where: { id }, include: { _count: { select: { respostas: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })

  const congelada = atual._count.respostas > 0

  if (congelada) {
    const ultima = await prisma.formularioVersao.findFirst({
      where: { formularioId: atual.formularioId },
      orderBy: { versao: 'desc' },
      select: { versao: true },
    })

    const nova = await prisma.formularioVersao.create({
      data: {
        formularioId: atual.formularioId,
        versao: (ultima?.versao ?? atual.versao) + 1,
        definicao: definicao as Prisma.InputJsonValue,
        publicadaEm: publicar ? new Date() : null,
      },
    })

    await logAudit(
      session.userId, 'CRIOU_VERSAO_FORMULARIO', 'FormularioVersao', nova.id,
      `Versão ${nova.versao} (a ${atual.versao} já tem respostas e ficou imutável)`,
    )
    return NextResponse.json({ versao: nova, novaVersaoCriada: true })
  }

  const versao = await prisma.formularioVersao.update({
    where: { id },
    data: {
      definicao: definicao as Prisma.InputJsonValue,
      ...(publicar ? { publicadaEm: new Date() } : {}),
    },
  })

  await logAudit(
    session.userId, publicar ? 'PUBLICOU_VERSAO_FORMULARIO' : 'SALVOU_VERSAO_FORMULARIO',
    'FormularioVersao', id, `Versão ${versao.versao}`,
  )
  return NextResponse.json({ versao, novaVersaoCriada: false })
}
