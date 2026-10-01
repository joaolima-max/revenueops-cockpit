import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { estadoDoUsuario } from '@/lib/autorizacao'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  /**
   * O estado vem DO BANCO, não do token.
   *
   * O token vive 7 dias. Se o menu fosse montado com o que ele carrega,
   * deixar de ser sócio só sumiria com o Conselho no próximo login — até uma
   * semana depois. Aqui é um server component: ler do banco custa uma
   * consulta por navegação e faz a mudança valer de imediato.
   *
   * Estado nulo = usuário inativo ou removido. Volta ao login.
   */
  const estado = await estadoDoUsuario(session.userId)
  if (!estado) redirect('/login')

  return (
    <DashboardShell
      role={session.role}
      permissoes={estado.permissoes}
      socio={estado.isPartner}
      userName={session.name}
      userEmail={session.email}
    >
      {children}
    </DashboardShell>
  )
}
