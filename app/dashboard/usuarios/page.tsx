export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeVerUsuarios, podeGerenciarUsuarios } from '@/lib/permissions'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  /**
   * VER e EDITAR são alçadas SEPARADAS.
   *
   * Antes bastava ser ADMIN — e todos os usuários de Production são ADMIN,
   * então o ambiente estava aberto para todos eles. Agora `view_usuarios`
   * abre a tela e `manage_usuarios` libera as ações; quem só consulta vê a
   * lista sem os botões, e a API recusa a mutação de qualquer forma.
   */
  if (!podeVerUsuarios(session.permissoes ?? null, session.role)) redirect('/dashboard')
  const podeGerenciar = podeGerenciarUsuarios(session.permissoes ?? null, session.role)

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, active: true, createdAt: true,
      permissoes: true, departamento: true, hierarquia: true, isPartner: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return <UsersClient users={users} podeGerenciar={podeGerenciar} />
}
