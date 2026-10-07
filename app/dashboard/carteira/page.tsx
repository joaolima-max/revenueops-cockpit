export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CarteiraNav from '@/components/carteira/CarteiraNav'
import CarteiraClient from './CarteiraClient'

export default async function CarteiraPage() {
  const session = await getSession()

  return (
    <div className="space-y-8">
      <CarteiraNav
        podeVerCertificados={!!session &&
          hasPermission(session.permissoes ?? null, 'view_certificates', session.role)}
      />
      <CarteiraClient />
    </div>
  )
}
