export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { podeCriarVolumetria, podeAdministrarVolumetria } from '@/lib/volumetria'
import VolumetriaClient from '@/components/volumetria/VolumetriaClient'

export default async function VolumetriaPage() {
  const session = await getSession()
  // Criar é de turno; editar/excluir é de ADMIN (§4). A API nega igual.
  const role = session?.role ?? ''
  return (
    <VolumetriaClient
      podeCriar={podeCriarVolumetria(role)}
      podeAdministrar={podeAdministrarVolumetria(role)}
    />
  )
}
