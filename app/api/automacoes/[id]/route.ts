import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { validarPayloadAutomacao, montarDadosAutomacao } from '@/lib/automacoes-payload'

function podeGerenciar(s: { role: string; permissoes?: string[] }): boolean {
  return hasPermission(s.permissoes ?? null, 'manage_automations', s.role)
}

/** Detalhe com as últimas execuções — é onde se descobre por que algo não rodou. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const automacao = await prisma.automacao.findUnique({
    where: { id },
    include: { execucoes: { orderBy: { createdAt: 'desc' }, take: 50 } },
  })
  if (!automacao) return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 })

  return NextResponse.json({ automacao })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const b = await request.json()
  const erro = validarPayloadAutomacao(b)
  if (erro) return NextResponse.json({ error: erro }, { status: 400 })

  const automacao = await prisma.automacao.update({ where: { id }, data: montarDadosAutomacao(b) })
  await logAudit(session.userId, 'EDITOU_AUTOMACAO', 'Automacao', id, automacao.nome)
  return NextResponse.json({ automacao })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const { ativo } = await request.json()
  if (typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'Informe ativo: true ou false.' }, { status: 400 })
  }

  const automacao = await prisma.automacao.update({ where: { id }, data: { ativo } })
  await logAudit(
    session.userId, ativo ? 'ATIVOU_AUTOMACAO' : 'DESATIVOU_AUTOMACAO', 'Automacao', id, automacao.nome,
  )
  return NextResponse.json({ automacao })
}
