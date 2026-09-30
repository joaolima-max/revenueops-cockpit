import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  CRITICIDADES, podeAdministrarIncidente, podeRegistrarIncidente,
  validarJanela, calcularDowntime, type Criticidade,
} from '@/lib/incidentes'

/**
 * PATCH — fecha o incidente. É a ação de turno, aberta a quem opera.
 *
 * Só grava `fim`. O downtime aparece calculado na mesma hora, em todas as
 * telas, porque nenhuma delas guarda o número.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeRegistrarIncidente(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.incidente.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Incidente não encontrado.' }, { status: 404 })

  const { fim } = await request.json()
  const dtFim = fim ? new Date(fim) : new Date()

  const problema = validarJanela(atual.inicio, dtFim)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const incidente = await prisma.incidente.update({ where: { id }, data: { fim: dtFim } })
  const downtime = calcularDowntime(incidente.inicio, incidente.fim)

  await logAudit(
    session.userId, 'FECHOU_INCIDENTE', 'Incidente', id,
    `${atual.titulo} — downtime ${downtime.rotulo}`,
  )

  return NextResponse.json({ incidente })
}

/**
 * PUT — edita o incidente. **Somente ADMIN.**
 *
 * `downtimeMins` não é aceito: reescrever a janela recalcula o downtime, e não
 * existe caminho para informá-lo à mão.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeAdministrarIncidente(session.role)) {
    return NextResponse.json(
      { error: 'Apenas administradores podem editar incidentes.' },
      { status: 403 },
    )
  }

  const { id } = await params
  const atual = await prisma.incidente.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Incidente não encontrado.' }, { status: 404 })

  const { titulo, descricao, inicio, fim, criticidade } = await request.json()

  const t = titulo === undefined ? undefined : String(titulo).trim()
  if (t !== undefined && !t) {
    return NextResponse.json({ error: 'Informe o título do incidente.' }, { status: 400 })
  }

  // A janela é validada inteira, com os valores que vão VIGORAR depois da
  // edição — não só com o que veio no corpo.
  const dtInicio = inicio !== undefined ? new Date(inicio) : atual.inicio
  const dtFim = fim !== undefined ? (fim ? new Date(fim) : null) : atual.fim
  const problema = validarJanela(dtInicio, dtFim)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const incidente = await prisma.incidente.update({
    where: { id },
    data: {
      ...(t ? { titulo: t } : {}),
      ...(descricao !== undefined
        ? { descricao: descricao ? String(descricao).slice(0, 2000) : null }
        : {}),
      ...(inicio !== undefined ? { inicio: dtInicio } : {}),
      ...(fim !== undefined ? { fim: dtFim } : {}),
      ...(criticidade !== undefined && CRITICIDADES.includes(criticidade)
        ? { criticidade: criticidade as Criticidade }
        : {}),
    },
  })

  const downtime = calcularDowntime(incidente.inicio, incidente.fim)
  await logAudit(
    session.userId, 'EDITOU_INCIDENTE', 'Incidente', id,
    `${incidente.titulo} — downtime ${downtime.rotulo}`,
  )

  return NextResponse.json({ incidente })
}

/**
 * DELETE — exclui o incidente. **Somente ADMIN.**
 *
 * `Incidente` não tem filhos no schema: nada aponta para ele, então a exclusão
 * física não arrasta histórico de nenhum outro modelo. A trilha do que existiu
 * permanece em `Auditoria`, que registra o registro, o fechamento, a edição e
 * esta exclusão — e não é apagada.
 *
 * A checagem de dependências é feita aqui mesmo, em vez de assumida: se um dia
 * algum modelo passar a referenciar Incidente, a exclusão é bloqueada com
 * explicação em vez de estourar violação de FK no banco.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeAdministrarIncidente(session.role)) {
    return NextResponse.json(
      { error: 'Apenas administradores podem excluir incidentes.' },
      { status: 403 },
    )
  }

  const { id } = await params
  const atual = await prisma.incidente.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Incidente não encontrado.' }, { status: 404 })

  const downtime = calcularDowntime(atual.inicio, atual.fim)

  try {
    await prisma.incidente.delete({ where: { id } })
  } catch {
    return NextResponse.json({
      error: 'Não foi possível excluir: há registros vinculados a este incidente. '
        + 'O histórico não é removido para permitir a exclusão.',
    }, { status: 409 })
  }

  await logAudit(
    session.userId, 'EXCLUIU_INCIDENTE', 'Incidente', id,
    `${atual.titulo} (${atual.criticidade}) — downtime ${downtime.rotulo}`,
  )

  return NextResponse.json({ ok: true })
}
