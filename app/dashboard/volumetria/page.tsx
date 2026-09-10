export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import VolumetriaClient from '@/components/volumetria/VolumetriaClient'

export default async function VolumetriaPage() {
  const session = await getSession()
  // Mesma regra de escrita que a tela já tinha antes de virar por cliente.
  return <VolumetriaClient podeGerenciar={session?.role !== 'COMERCIAL'} />
}
