export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { podeAdministrarPipeline } from '@/lib/pipeline'
import FunisClient from './FunisClient'

export default async function FunisPage() {
  const session = await getSession()
  // O proxy casa rotas por prefixo, e /dashboard/pipeline cobre esta rota.
  // Por isso a verificação real acontece aqui — e de novo em cada API.
  if (!session || !podeAdministrarPipeline(session)) redirect('/dashboard/pipeline')

  return <FunisClient />
}
