import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeAdministrarPipeline, reordenar } from '@/lib/pipeline'
import { acessoAoFunil, auditarPipeline } from '@/lib/pipeline-db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const funil = await prisma.pipelineFunil.findUnique({
    where: { id },
    include: {
      etapas: { orderBy: { ordem: 'asc' } },
      permissoes: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      _count: { select: { deals: true } },
    },
  })

  return NextResponse.json({ funil, acesso })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.administrar) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { nome, descricao, area, exigeCliente } = await request.json()
  const n = nome !== undefined ? String(nome).trim() : undefined
  if (n !== undefined && !n) return NextResponse.json({ error: 'Informe o nome do funil.' }, { status: 400 })

  if (n) {
    const conflito = await prisma.pipelineFunil.findUnique({ where: { nome: n } })
    if (conflito && conflito.id !== id) {
      return NextResponse.json({ error: `Já existe um funil chamado ${n}.` }, { status: 409 })
    }
  }

  const funil = await prisma.pipelineFunil.update({
    where: { id },
    data: {
      ...(n ? { nome: n } : {}),
      ...(descricao !== undefined ? { descricao: descricao ? String(descricao).slice(0, 500) : null } : {}),
      ...(area !== undefined ? { area: area ? String(area).slice(0, 120) : null } : {}),
      ...(exigeCliente !== undefined ? { exigeCliente: Boolean(exigeCliente) } : {}),
    },
  })

  await auditarPipeline(session.userId, 'EDITOU_FUNIL', 'PipelineFunil', id, `Funil: ${funil.nome}`)
  return NextResponse.json({ funil })
}

/** Ativa/inativa o funil, ou reordena a lista inteira. Nunca exclui. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  if (Array.isArray(body.ordemFunis)) {
    if (!podeAdministrarPipeline(session)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }
    const ids: string[] = body.ordemFunis.map(String)
    const existentes = await prisma.pipelineFunil.findMany({ select: { id: true } })
    const conhecidos = new Set(existentes.map((f) => f.id))
    if (ids.some((i) => !conhecidos.has(i)) || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'Ordenação inválida.' }, { status: 400 })
    }
    await prisma.$transaction(
      reordenar(ids).map((o) => prisma.pipelineFunil.update({ where: { id: o.id }, data: { ordem: o.ordem } })),
    )
    await auditarPipeline(session.userId, 'REORDENOU_FUNIS', 'PipelineFunil', id, `${ids.length} funis`)
    return NextResponse.json({ ok: true })
  }

  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.administrar) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  if (typeof body.ativo !== 'boolean') {
    return NextResponse.json({ error: 'Informe ativo: true ou false.' }, { status: 400 })
  }

  const funil = await prisma.pipelineFunil.update({ where: { id }, data: { ativo: body.ativo } })
  await auditarPipeline(
    session.userId, body.ativo ? 'REATIVOU_FUNIL' : 'INATIVOU_FUNIL',
    'PipelineFunil', id, `Funil: ${funil.nome}`,
  )
  return NextResponse.json({ funil })
}
