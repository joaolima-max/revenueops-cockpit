import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { validarLinhaPermissao, ACOES_FUNIL } from '@/lib/pipeline'
import { acessoAoFunil, auditarPipeline } from '@/lib/pipeline-db'

const ROLES = ['ADMIN', 'OPERACIONAL', 'COMERCIAL'] as const
type RoleValida = (typeof ROLES)[number]

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.administrar) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const [permissoes, usuarios] = await Promise.all([
    prisma.pipelinePermissao.findMany({
      where: { funilId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } }),
  ])

  return NextResponse.json({ permissoes, usuarios })
}

/**
 * Substitui o conjunto inteiro de alçadas do funil. Enviar uma lista vazia
 * devolve o funil ao padrão herdado do módulo — visível para quem tem
 * `view_pipeline` —, e não o torna inacessível.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (!acesso.administrar) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { permissoes } = await request.json()
  if (!Array.isArray(permissoes)) {
    return NextResponse.json({ error: 'Informe a lista permissoes.' }, { status: 400 })
  }

  const linhas: Array<{
    funilId: string; role: RoleValida | null; userId: string | null
    ver: boolean; editar: boolean; mover: boolean; criar: boolean
    transferir: boolean; administrar: boolean; apenasProprios: boolean
  }> = []

  for (const p of permissoes) {
    const role = p.role && ROLES.includes(p.role) ? (p.role as RoleValida) : null
    const userId = p.userId ? String(p.userId) : null

    const problema = validarLinhaPermissao({ role, userId })
    if (problema) return NextResponse.json({ error: problema }, { status: 400 })

    if (linhas.some((l) => (role && l.role === role) || (userId && l.userId === userId))) {
      return NextResponse.json({ error: 'Há duas regras para a mesma role ou o mesmo usuário.' }, { status: 400 })
    }

    linhas.push({
      funilId: id, role, userId,
      ...Object.fromEntries(ACOES_FUNIL.map((a) => [a, Boolean(p[a])])) as Record<(typeof ACOES_FUNIL)[number], boolean>,
      apenasProprios: Boolean(p.apenasProprios),
    })
  }

  if (linhas.some((l) => l.userId)) {
    const ids = linhas.map((l) => l.userId).filter((u): u is string => !!u)
    const achados = await prisma.user.count({ where: { id: { in: ids } } })
    if (achados !== new Set(ids).size) {
      return NextResponse.json({ error: 'Um dos usuários informados não existe.' }, { status: 400 })
    }
  }

  // Substituição do conjunto: as linhas antigas do funil dão lugar às novas.
  // É configuração de alçada, não histórico — nada de dado de negócio é perdido.
  await prisma.$transaction([
    prisma.pipelinePermissao.deleteMany({ where: { funilId: id } }),
    ...(linhas.length > 0 ? [prisma.pipelinePermissao.createMany({ data: linhas })] : []),
  ])

  await auditarPipeline(
    session.userId, 'DEFINIU_PERMISSOES_FUNIL', 'PipelineFunil', id,
    `${linhas.length} regra(s) de acesso`,
  )

  const atualizadas = await prisma.pipelinePermissao.findMany({
    where: { funilId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ permissoes: atualizadas })
}
