import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { acessoAoFunil, auditarPipeline } from '@/lib/pipeline-db'

/**
 * So NORMAL. Ganho e Perdido deixaram de ser etapas e viraram o RESULTADO do
 * card (Deal.resultado): criar uma coluna "Ganho" recriaria, dentro do funil,
 * exatamente o problema que esta rodada eliminou.
 */
const TIPOS = ['NORMAL'] as const
type Tipo = (typeof TIPOS)[number]

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const etapas = await prisma.pipelineEtapa.findMany({
    where: { funilId: id },
    orderBy: { ordem: 'asc' },
    include: { _count: { select: { deals: true } } },
  })
  return NextResponse.json({ etapas })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.administrar) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { nome, descricao, cor, tipo } = await request.json()
  const n = String(nome ?? '').trim()
  if (!n) return NextResponse.json({ error: 'Informe o nome da etapa.' }, { status: 400 })

  if (tipo !== undefined && !TIPOS.includes(tipo)) {
    return NextResponse.json({
      error: 'Ganho e Perdido nao sao etapas — sao o resultado do card. '
        + 'Crie a etapa como parte do processo e marque o desfecho no proprio card.',
    }, { status: 400 })
  }
  const t: Tipo = 'NORMAL'

  const duplicada = await prisma.pipelineEtapa.findUnique({ where: { funilId_nome: { funilId: id, nome: n } } })
  if (duplicada) return NextResponse.json({ error: `Este funil já tem uma etapa "${n}".` }, { status: 409 })

  const ultima = await prisma.pipelineEtapa.findFirst({
    where: { funilId: id }, orderBy: { ordem: 'desc' }, select: { ordem: true },
  })

  const etapa = await prisma.pipelineEtapa.create({
    data: {
      funilId: id,
      nome: n,
      descricao: descricao ? String(descricao).slice(0, 500) : null,
      cor: cor ? String(cor).slice(0, 32) : null,
      tipo: t,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
  })

  await auditarPipeline(session.userId, 'CRIOU_ETAPA', 'PipelineEtapa', etapa.id, `${n} no funil ${id}`)
  return NextResponse.json({ etapa }, { status: 201 })
}
