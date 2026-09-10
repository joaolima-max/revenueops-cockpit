import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'

const STATUS = ['RASCUNHO', 'ENVIADA', 'EM_ANALISE', 'CONCLUIDA'] as const
type Status = (typeof STATUS)[number]

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const status = sp.get('status')

  const respostas = await prisma.formularioResposta.findMany({
    where: {
      ...(sp.get('versaoId') ? { versaoId: sp.get('versaoId')! } : {}),
      ...(sp.get('clienteId') ? { clienteId: sp.get('clienteId')! } : {}),
      ...(STATUS.includes(status as Status) ? { status: status as Status } : {}),
      ...(sp.get('formularioId') ? { versao: { formularioId: sp.get('formularioId')! } } : {}),
    },
    include: {
      versao: { select: { versao: true, definicao: true, formulario: { select: { id: true, nome: true } } } },
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { name: true } },
      _count: { select: { anexos: true } },
    },
    orderBy: { enviadaEm: 'desc' },
    take: 200,
  })

  return NextResponse.json({ respostas })
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id, status, responsavelId } = await request.json()
  if (!id) return NextResponse.json({ error: 'Informe a resposta.' }, { status: 400 })
  if (status && !STATUS.includes(status)) {
    return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
  }

  const resposta = await prisma.formularioResposta.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(responsavelId !== undefined ? { responsavelId: responsavelId || null } : {}),
    },
  })
  return NextResponse.json({ resposta })
}
