import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { permissoesDoBanco } from '@/lib/autorizacao'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  /**
   * As permissões vêm DO BANCO, não do token.
   *
   * O token vive 7 dias. Se o menu fosse montado com a lista que ele carrega,
   * revogar o acesso de alguém ao Conselho só sumiria do menu no próximo
   * login — até uma semana depois. Aqui é um server component: ler do banco
   * custa uma consulta por navegação e faz a revogação valer de imediato.
   *
   * Lista nula = usuário inativo ou removido. Volta ao login.
   */
  const permissoes = await permissoesDoBanco(session.userId)
  if (permissoes === null) redirect('/login')

  return (
    <DashboardShell
      role={session.role}
      permissoes={permissoes}
      userName={session.name}
      userEmail={session.email}
    >
      {children}
    </DashboardShell>
  )
}
