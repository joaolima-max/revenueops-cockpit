import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

/**
 * Multiplicador do Float. Versionado por vigência: alterar o valor hoje não
 * reescreve o Float de períodos já fechados.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const configs = await prisma.floatConfig.findMany({ orderBy: { vigenciaInicio: 'desc' } })
  return NextResponse.json({ configs })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { multiplicador, vigenciaInicio, notas } = await request.json()

  const m = Number(multiplicador)
  if (!Number.isFinite(m) || m < 0 || m > 1) {
    return NextResponse.json(
      { error: 'Multiplicador deve estar entre 0 e 1 (ex.: 0,0004 para 0,04% ao dia).' },
      { status: 400 }
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(vigenciaInicio))) {
    return NextResponse.json({ error: 'Vigência inválida. Use YYYY-MM-DD.' }, { status: 400 })
  }
  const data = new Date(vigenciaInicio + 'T00:00:00Z')

  const config = await prisma.floatConfig.upsert({
    where: { vigenciaInicio: data },
    create: { multiplicador: m, vigenciaInicio: data, notas: notas ? String(notas).slice(0, 500) : null },
    update: { multiplicador: m, notas: notas ? String(notas).slice(0, 500) : null },
  })

  await prisma.auditoria.create({
    data: { acao: 'CONFIGURAR_FLOAT', entidade: 'FloatConfig', entidadeId: config.id,
      detalhes: `Multiplicador ${m} a partir de ${vigenciaInicio}`, userId: session.userId },
  })

  return NextResponse.json({ config })
}
