import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  podeGerenciarUsuarios, ALL_PERMISSIONS, PERMISSOES_RESTRITAS,
} from '@/lib/permissions'

/**
 * As PERMISSÕES de um usuário.
 *
 * É a mutação mais sensível do sistema — quem altera esta lista decide o que
 * todos os outros podem fazer. Exige `manage_usuarios`, e é auditada com a
 * lista antes e depois.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciarUsuarios(session.permissoes ?? null, session.role)) {
    return NextResponse.json(
      { error: 'Alterar permissões exige a permissão de gerenciar usuários.' },
      { status: 403 },
    )
  }

  const { id } = await params
  const corpo = await request.json()

  if (!Array.isArray(corpo?.permissoes)) {
    return NextResponse.json({ error: 'Envie a lista de permissões.' }, { status: 400 })
  }

  /**
   * SÓ CHAVES DO CATÁLOGO entram.
   *
   * O corpo é JSON arbitrário: sem este filtro, qualquer texto viraria uma
   * "permissão" gravada — inútil para autorizar, mas suficiente para poluir a
   * lista e esconder o que o usuário de fato tem. Chave desconhecida é
   * descartada em silêncio, e a auditoria registra o que entrou.
   */
  const catalogo = new Set(ALL_PERMISSIONS.map((p) => p.key))
  const limpas = [...new Set(
    (corpo.permissoes as unknown[])
      .filter((k): k is string => typeof k === 'string')
      .filter((k) => catalogo.has(k)),
  )]

  const antes = await prisma.user.findUnique({
    where: { id }, select: { id: true, name: true, permissoes: true },
  })
  if (!antes) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

  const user = await prisma.user.update({
    where: { id },
    data: { permissoes: JSON.stringify(limpas) },
    select: {
      id: true, name: true, email: true, role: true, active: true, permissoes: true,
      departamento: true, hierarquia: true, isPartner: true,
    },
  })

  // As RESTRITAS aparecem destacadas no log: são as que não vêm por perfil, e
  // conceder uma delas é a decisão que mais interessa a quem audita depois.
  const restritasConcedidas = limpas.filter((k) => PERMISSOES_RESTRITAS.includes(k))

  await logAudit(
    session.userId, 'ALTEROU_PERMISSOES', 'User', id,
    `${antes.name}: ${limpas.length} permissão(ões)`
    + (restritasConcedidas.length > 0
      ? ` · restritas: ${restritasConcedidas.join(', ')}`
      : ' · nenhuma restrita'),
  )

  return NextResponse.json(user)
}
