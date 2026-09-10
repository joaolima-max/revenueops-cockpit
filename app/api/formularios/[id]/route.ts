import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const formulario = await prisma.formulario.findUnique({
    where: { id },
    include: {
      criadoPor: { select: { name: true } },
      versoes: {
        orderBy: { versao: 'desc' },
        include: {
          _count: { select: { respostas: true } },
          links: {
            orderBy: { createdAt: 'desc' },
            include: { cliente: { select: { id: true, nome: true } }, _count: { select: { respostas: true } } },
          },
        },
      },
    },
  })
  if (!formulario) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })

  return NextResponse.json({ formulario })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { nome, descricao, ativo } = await request.json()

  const formulario = await prisma.formulario.update({
    where: { id },
    data: {
      ...(nome ? { nome: String(nome).trim().slice(0, 160) } : {}),
      ...(descricao !== undefined ? { descricao: descricao ? String(descricao).slice(0, 500) : null } : {}),
      ...(typeof ativo === 'boolean' ? { ativo } : {}),
    },
  })

  await logAudit(session.userId, 'EDITOU_FORMULARIO', 'Formulario', id, formulario.nome)
  return NextResponse.json({ formulario })
}
