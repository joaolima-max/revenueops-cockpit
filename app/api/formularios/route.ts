import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { DEFINICAO_VAZIA } from '@/lib/formularios'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const incluirInativos = request.nextUrl.searchParams.get('incluirInativos') === '1'

  const formularios = await prisma.formulario.findMany({
    where: incluirInativos ? {} : { ativo: true },
    include: {
      criadoPor: { select: { name: true } },
      versoes: {
        orderBy: { versao: 'desc' },
        select: { id: true, versao: true, publicadaEm: true, _count: { select: { respostas: true, links: true } } },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // Painel: enviados (links gerados), respostas, taxa de resposta e conclusão.
  const [links, respostas] = await Promise.all([
    prisma.formularioLink.count(),
    prisma.formularioResposta.groupBy({ by: ['status'], _count: true }),
  ])
  const totalRespostas = respostas.reduce((s, r) => s + r._count, 0)
  const concluidas = respostas.find((r) => r.status === 'CONCLUIDA')?._count ?? 0

  return NextResponse.json({
    formularios,
    painel: {
      enviados: links,
      respostas: totalRespostas,
      taxaResposta: links > 0 ? (totalRespostas / links) * 100 : null,
      taxaConclusao: totalRespostas > 0 ? (concluidas / totalRespostas) * 100 : null,
      porStatus: respostas.map((r) => ({ status: r.status, total: r._count })),
    },
  })
}

/** Cria o formulário já com a versão 1 em rascunho, para o construtor abrir pronto. */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { nome, descricao } = await request.json()
  if (!String(nome ?? '').trim()) return NextResponse.json({ error: 'Informe o nome do formulário.' }, { status: 400 })

  const formulario = await prisma.$transaction(async (tx) => {
    const f = await tx.formulario.create({
      data: {
        nome: String(nome).trim().slice(0, 160),
        descricao: descricao ? String(descricao).slice(0, 500) : null,
        criadoPorId: session.userId,
      },
    })
    await tx.formularioVersao.create({
      data: {
        formularioId: f.id,
        versao: 1,
        definicao: { ...DEFINICAO_VAZIA, aparencia: { ...DEFINICAO_VAZIA.aparencia, titulo: f.nome } } as unknown as Prisma.InputJsonValue,
      },
    })
    return f
  })

  await logAudit(session.userId, 'CRIOU_FORMULARIO', 'Formulario', formulario.id, formulario.nome)
  return NextResponse.json({ formulario }, { status: 201 })
}
