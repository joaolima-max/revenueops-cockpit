export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CpCrNav from '@/components/financeiro/CpCrNav'
import LancamentosClient from './LancamentosClient'

/**
 * LANÇAMENTOS — a base que as duas outras abas leem pelo vencimento.
 *
 * A tela NÃO exige `view_financeiro` para abrir, e isso é o comportamento que
 * ela já tinha como menu próprio: quem não pode gerenciar entra em leitura
 * (`podeGerenciar` falso) em vez de ser redirecionado. Consolidar os menus não
 * é o momento de apertar uma alçada que ninguém pediu para apertar.
 */
export default async function LancamentosPage() {
  const session = await getSession()
  const podeGerenciar = !!session &&
    hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)

  return (
    <div className="space-y-8">
      <CpCrNav />
      <LancamentosClient podeGerenciar={podeGerenciar} />
    </div>
  )
}
