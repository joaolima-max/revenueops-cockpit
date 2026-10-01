import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      gestor: { select: { id: true, name: true } },
    },
  })

  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  return NextResponse.json({ cliente })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  // Mesmo conjunto enxuto do POST. Ver o comentário em ../route.ts.
  const {
    nome, cnpj, email, telefone, modeloOperacional, status,
    segmento, segmentoComercialId, mensalidadeApi,
    dataFechamento, dataEncerramento, notas, ownerId, gestorId, numeroConta,
  } = body

  const antes = await prisma.cliente.findUnique({
    where: { id },
    select: {
      nome: true, status: true, numeroConta: true,
      gestorId: true, segmentoComercialId: true,
    },
  })
  if (!antes) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  /**
   * GESTOR DE CONTA — trocar, vincular ou REMOVER.
   *
   * `gestorId: ''` significa remover, e é por isso que o teste é por
   * `!== undefined`: tratar string vazia como "não informado" tornaria a
   * remoção impossível pela tela.
   *
   * Qualquer usuário ATIVO é elegível. Gestor de conta é responsabilidade pela
   * conta — não é Diretor, não é sócio, não é Admin —, e filtrar por
   * hierarquia aqui transformaria uma atribuição operacional em cargo.
   */
  if (gestorId) {
    const g = await prisma.user.findUnique({
      where: { id: String(gestorId) }, select: { id: true, active: true },
    })
    if (!g) return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 400 })
    if (!g.active) {
      return NextResponse.json(
        { error: 'Esse usuário está inativo e não pode ser gestor de conta.' },
        { status: 400 },
      )
    }
  }

  const cliente = await prisma.cliente.update({
    where: { id },
    data: {
      ...(nome ? { nome } : {}),
      cnpj: cnpj ?? undefined, email: email ?? undefined, telefone: telefone ?? undefined,
      ...(modeloOperacional ? { modeloOperacional } : {}),
      // A tela oferece ATIVO e INATIVO. Os legados do enum não são graváveis
      // daqui — só legíveis nos registros que já os têm.
      ...(status === 'ATIVO' || status === 'INATIVO' ? { status } : {}),
      ...(segmento !== undefined ? { segmento: segmento || null } : {}),
      ...(segmentoComercialId !== undefined
        ? { segmentoComercialId: segmentoComercialId || null } : {}),
      ...(numeroConta !== undefined
        ? { numeroConta: typeof numeroConta === 'string' && numeroConta.trim()
            ? numeroConta.trim() : null }
        : {}),
      mensalidadeApi: mensalidadeApi ?? undefined,
      dataFechamento: dataFechamento ? new Date(dataFechamento) : undefined,
      dataEncerramento: dataEncerramento ? new Date(dataEncerramento) : undefined,
      notas: notas ?? undefined,
      ...(ownerId ? { ownerId } : {}),
      ...(gestorId !== undefined ? { gestorId: gestorId || null } : {}),
    },
    include: {
      gestor: { select: { id: true, name: true } },
      segmentoComercial: { select: { id: true, nome: true, slug: true } },
    },
  })

  // A auditoria registra O QUE MUDOU, não só que houve edição: "Nome: X" não
  // dizia se o status, o gestor ou a conta tinham sido alterados.
  const mudancas = [
    antes.nome !== cliente.nome && `nome "${antes.nome}" → "${cliente.nome}"`,
    antes.status !== cliente.status && `status ${antes.status} → ${cliente.status}`,
    antes.numeroConta !== cliente.numeroConta
      && `conta ${antes.numeroConta ?? '—'} → ${cliente.numeroConta ?? '—'}`,
    antes.gestorId !== cliente.gestorId
      && `gestor → ${cliente.gestor?.name ?? 'removido'}`,
    antes.segmentoComercialId !== cliente.segmentoComercialId
      && `segmento → ${cliente.segmentoComercial?.nome ?? 'removido'}`,
  ].filter(Boolean).join(' · ')

  await logAudit(
    session.userId, 'EDITOU_CLIENTE', 'Cliente', id,
    mudancas || `${cliente.nome} (sem alteração nos campos auditados)`,
  )

  return NextResponse.json({ cliente })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  await prisma.cliente.delete({ where: { id } })
  await logAudit(session.userId, 'EXCLUIU_CLIENTE', 'Cliente', id, '')
  return NextResponse.json({ ok: true })
}
