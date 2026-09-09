import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { reordenar, validarReordenacao } from '@/lib/pipeline'
import { acessoAoFunil, auditarPipeline } from '@/lib/pipeline-db'

/** Reordena todas as etapas do funil de uma vez, numa transação. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.administrar) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { ordem } = await request.json()
  if (!Array.isArray(ordem)) return NextResponse.json({ error: 'Informe a lista ordem.' }, { status: 400 })

  const atuais = await prisma.pipelineEtapa.findMany({ where: { funilId: id }, select: { id: true } })
  const erro = validarReordenacao(atuais.map((e) => e.id), ordem.map(String))
  if (erro) return NextResponse.json({ error: erro }, { status: 400 })

  await prisma.$transaction(
    reordenar(ordem.map(String)).map((o) =>
      prisma.pipelineEtapa.update({ where: { id: o.id }, data: { ordem: o.ordem } }),
    ),
  )

  await auditarPipeline(session.userId, 'REORDENOU_ETAPAS', 'PipelineFunil', id, `${ordem.length} etapas`)
  return NextResponse.json({ ok: true })
}
