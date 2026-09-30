import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  CRITICIDADES, podeRegistrarIncidente, validarJanela, type Criticidade,
} from '@/lib/incidentes'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const incidentes = await prisma.incidente.findMany({
    orderBy: { inicio: 'desc' },
    take: 50,
  })

  return NextResponse.json({ incidentes })
}

/**
 * Registra o incidente. `downtimeMins` NÃO é aceito: downtime é derivado de
 * (fim − início) em lib/incidentes.ts. Um corpo que traga o campo é ignorado em
 * silêncio — não há caminho para sobrescrever o cálculo.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeRegistrarIncidente(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { titulo, descricao, inicio, fim, criticidade } = await request.json()

  const t = String(titulo ?? '').trim()
  if (!t) return NextResponse.json({ error: 'Informe o título do incidente.' }, { status: 400 })
  if (!inicio) return NextResponse.json({ error: 'Informe a data/hora de início.' }, { status: 400 })

  const dtInicio = new Date(inicio)
  const dtFim = fim ? new Date(fim) : null
  const problema = validarJanela(dtInicio, dtFim)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const crit: Criticidade = CRITICIDADES.includes(criticidade) ? criticidade : 'MEDIA'

  const incidente = await prisma.incidente.create({
    data: {
      titulo: t,
      descricao: descricao ? String(descricao).slice(0, 2000) : null,
      inicio: dtInicio,
      fim: dtFim,
      criticidade: crit,
    },
  })

  await logAudit(
    session.userId, 'REGISTROU_INCIDENTE', 'Incidente', incidente.id,
    `${t} (${crit})${dtFim ? ' — já encerrado' : ' — em aberto'}`,
  )

  return NextResponse.json({ incidente }, { status: 201 })
}
