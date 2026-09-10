import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { validarPayloadAutomacao, montarDadosAutomacao } from '@/lib/automacoes-payload'

function podeGerenciar(s: { role: string; permissoes?: string[] }): boolean {
  return hasPermission(s.permissoes ?? null, 'manage_automations', s.role)
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const [automacoes, funis, usuarios] = await Promise.all([
    prisma.automacao.findMany({
      include: {
        funil: { select: { nome: true } },
        etapa: { select: { nome: true } },
        funilDestino: { select: { nome: true } },
        etapaDestino: { select: { nome: true } },
        destinatario: { select: { name: true } },
        _count: { select: { execucoes: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.pipelineFunil.findMany({
      where: { ativo: true },
      include: { etapas: { where: { ativo: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true } } },
      orderBy: { ordem: 'asc' },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
  ])

  return NextResponse.json({ automacoes, funis, usuarios })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const b = await request.json()
  const erro = validarPayloadAutomacao(b)
  if (erro) return NextResponse.json({ error: erro }, { status: 400 })

  const automacao = await prisma.automacao.create({ data: montarDadosAutomacao(b) })

  await logAudit(
    session.userId, 'CRIOU_AUTOMACAO', 'Automacao', automacao.id,
    `${automacao.nome}: ${automacao.gatilho} → ${automacao.acao}`,
  )
  return NextResponse.json({ automacao }, { status: 201 })
}
