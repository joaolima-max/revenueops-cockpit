import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  roleDoPerfil, DEPARTAMENTOS, HIERARQUIAS, podeGerenciarUsuarios,
  type Perfil, type Departamento, type Hierarquia,
} from '@/lib/permissions'

/** Só valor que existe no enum vira coluna. Texto solto do corpo não entra. */
function valido(v: unknown, permitidos: readonly string[]): string | null {
  return typeof v === 'string' && permitidos.includes(v) ? v : null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  // EDITAR exige `manage_usuarios`. Quem só tem `view_usuarios` consulta e
  // não altera — é a razão de as duas chaves serem separadas.
  if (!podeGerenciarUsuarios(session.permissoes ?? null, session.role)) {
    return NextResponse.json(
      { error: 'Editar usuário exige a permissão de gerenciar usuários.' }, { status: 403 },
    )
  }

  const { id } = await params
  const body = await request.json()

  const atual = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, departamento: true, isPartner: true },
  })
  if (!atual) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}

  if (body.name !== undefined) updateData.name = String(body.name).trim()
  if (body.active !== undefined) updateData.active = !!body.active

  /**
   * SÓCIO — a autorização do Conselho Administrativo.
   *
   * Eixo próprio: não é perfil, não é departamento, não é hierarquia. Marcar
   * alguém como sócio é a decisão mais sensível desta tela, e por isso vai
   * para a auditoria com destaque.
   */
  if (body.isPartner !== undefined) updateData.isPartner = !!body.isPartner

  if (body.departamento !== undefined) {
    updateData.departamento = valido(body.departamento, DEPARTAMENTOS) as Departamento | null
  }
  if (body.hierarquia !== undefined) {
    updateData.hierarquia = valido(body.hierarquia, HIERARQUIAS) as Hierarquia | null
  }

  /**
   * PERFIL → ROLE, preservando a granularidade.
   *
   * Promover a Admin é inequívoco. REBAIXAR não é: existem três roles
   * não-admin, e `roleDoPerfil` PRESERVA a role atual quando ela já é de
   * colaborador — só decide pelo departamento quando a pessoa estava em ADMIN
   * e não havia outra pista. Sem isso, cada salvamento da tela regravaria a
   * role e apagaria as alçadas de funil do usuário.
   *
   * `body.role` continua aceito para gravar a role exata, e vence o perfil.
   */
  if (body.role !== undefined) {
    updateData.role = body.role
  } else if (body.perfil !== undefined) {
    const perfil: Perfil = body.perfil === 'ADMIN' ? 'ADMIN' : 'COLABORADOR'
    const departamento =
      (updateData.departamento as Departamento | null | undefined) ?? atual.departamento
    updateData.role = roleDoPerfil(perfil, departamento ?? null, atual.role)
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, name: true, email: true, role: true, active: true, createdAt: true,
      departamento: true, hierarquia: true, isPartner: true,
    },
  })

  // Virar ou deixar de ser SÓCIO é registrado à parte: é o que decide quem
  // abre o Conselho, e quem audita depois precisa achar essa mudança.
  if (atual.isPartner !== user.isPartner) {
    await logAudit(
      session.userId,
      user.isPartner ? 'MARCOU_COMO_SOCIO' : 'REMOVEU_SOCIO',
      'User', id,
      `${atual.name}: acesso ao Conselho Administrativo `
      + (user.isPartner ? 'concedido' : 'removido'),
    )
  }

  return NextResponse.json(user)
}
