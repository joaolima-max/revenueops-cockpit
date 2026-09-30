import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import {
  META_DIRECOES, META_UNIDADES, validarValorMeta,
  type MetaDirecao, type MetaUnidade,
} from '@/lib/metas'

/**
 * Edita o alvo, a direção e a unidade. NÃO existe campo de realizado: ele vem
 * do Lançamento Diário e nunca é digitado.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.meta.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Meta não encontrada.' }, { status: 404 })

  const { valor, direcao, unidade } = await request.json()

  const uni: MetaUnidade = META_UNIDADES.includes(unidade) ? unidade : atual.unidade
  const dir: MetaDirecao = META_DIRECOES.includes(direcao) ? direcao : atual.direcao
  const n = valor !== undefined ? Number(valor) : atual.valor

  const problema = validarValorMeta(n, uni)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const meta = await prisma.meta.update({
    where: { id },
    data: { valor: n, direcao: dir, unidade: uni },
  })

  await prisma.auditoria.create({
    data: {
      acao: 'EDITOU_META', entidade: 'Meta', entidadeId: id,
      detalhes: `${meta.tipo} em ${meta.periodo}: ${n} (${uni}, ${dir})`,
      userId: session.userId,
    },
  })

  return NextResponse.json({ meta })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.meta.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Meta não encontrada.' }, { status: 404 })

  await prisma.meta.delete({ where: { id } })

  await prisma.auditoria.create({
    data: {
      acao: 'EXCLUIU_META', entidade: 'Meta', entidadeId: id,
      detalhes: `${atual.tipo} em ${atual.periodo}`, userId: session.userId,
    },
  })

  return NextResponse.json({ ok: true })
}
