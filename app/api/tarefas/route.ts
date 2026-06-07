import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') || ''
  const prioridade = searchParams.get('prioridade') || ''
  const clienteId = searchParams.get('clienteId') || ''
  const responsavelId = searchParams.get('responsavelId') || ''

  const tarefas = await prisma.tarefa.findMany({
    where: {
      ...(status ? { status: status as 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA' } : {}),
      ...(prioridade ? { prioridade: prioridade as 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA' } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(responsavelId ? { responsavelId } : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      criadoPor: { select: { id: true, name: true } },
    },
    orderBy: [{ prioridade: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ tarefas })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { titulo, descricao, prioridade, dueDate, clienteId, responsavelId } = body

  if (!titulo || !responsavelId) {
    return NextResponse.json({ error: 'Título e responsável são obrigatórios' }, { status: 400 })
  }

  const tarefa = await prisma.tarefa.create({
    data: {
      titulo, descricao: descricao || null,
      prioridade: prioridade || 'MEDIA',
      dueDate: dueDate ? new Date(dueDate) : null,
      clienteId: clienteId || null,
      responsavelId,
      criadoPorId: session.userId,
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      criadoPor: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ tarefa }, { status: 201 })
}
