import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { acessoAoFunil, registrarMovimentacao, stageLegado } from '@/lib/pipeline-db'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const stage = searchParams.get('stage')
  const search = searchParams.get('search')

  const where: Record<string, unknown> = {}
  if (stage) where.stage = stage
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (session.role === 'COMERCIAL') {
    where.ownerId = session.userId
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(deals)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const data = await request.json()

  // O card SEMPRE nasce de um Lead que ja existe (§7). O Pipeline nao cadastra
  // Lead: sem esta checagem, a API aceitaria um card solto e voltariamos a ter
  // duas origens para a mesma oportunidade.
  const leadId = data.leadId ? String(data.leadId) : ''
  if (!leadId) {
    return NextResponse.json(
      { error: 'Selecione um lead existente. O card do pipeline sempre nasce de um lead.' },
      { status: 400 },
    )
  }
  const lead = await prisma.lead.findUnique({
    where: { id: leadId }, select: { id: true, name: true, company: true },
  })
  if (!lead) return NextResponse.json({ error: 'Lead nao encontrado.' }, { status: 404 })

  // O titulo do card VEM DO LEAD. A interface ja manda derivado, mas quem
  // decide e o servidor: assim nao existe um segundo lugar onde escrever o nome
  // da oportunidade e depois ele divergir do cadastro. Um titulo informado no
  // corpo e aceito apenas se nao for vazio, para nao perder ajuste manual.
  const titulo = String(data.title ?? '').trim() || lead.company || lead.name

  // Card criado a partir do quadro: nasce numa etapa de um funil. Sem etapa, o
  // comportamento antigo continua valendo, para nao quebrar quem chama a API
  // sem conhecer funis.
  const etapa = data.etapaId
    ? await prisma.pipelineEtapa.findUnique({ where: { id: String(data.etapaId) } })
    : null

  if (data.etapaId && !etapa) {
    return NextResponse.json({ error: 'Etapa nao encontrada' }, { status: 404 })
  }

  if (etapa) {
    const acesso = await acessoAoFunil(session, etapa.funilId)
    if (!acesso?.criar) {
      return NextResponse.json({ error: 'Voce nao pode criar cards neste funil.' }, { status: 403 })
    }
    if (!etapa.ativo) {
      return NextResponse.json({ error: 'A etapa escolhida esta inativa.' }, { status: 400 })
    }
  }

  const stage = etapa ? stageLegado(etapa.id) : null

  const deal = await prisma.$transaction(async (tx) => {
    const criado = await tx.deal.create({
      data: {
        title: titulo,
        value: parseFloat(data.value),
        stage: (stage ?? data.stage ?? 'PROSPECCAO') as never,
        probability: data.probability || 0,
        notes: data.notes,
        leadId,
        clienteId: data.clienteId || null,
        funilId: etapa?.funilId ?? null,
        etapaId: etapa?.id ?? null,
        expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
        ownerId: session.userId,
      },
      include: {
        owner: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, company: true } },
        cliente: { select: { id: true, nome: true } },
      },
    })

    if (etapa) {
      await registrarMovimentacao(tx, {
        dealId: criado.id,
        tipo: 'CRIACAO',
        funilOrigemId: null,
        etapaOrigemId: null,
        funilDestinoId: etapa.funilId,
        etapaDestinoId: etapa.id,
        userId: session.userId,
      })
    }

    return criado
  })

  return NextResponse.json(deal, { status: 201 })
}
