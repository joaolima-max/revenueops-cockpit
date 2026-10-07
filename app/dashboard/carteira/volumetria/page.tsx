export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { podeCriarVolumetria, podeAdministrarVolumetria } from '@/lib/volumetria'
import CarteiraNav from '@/components/carteira/CarteiraNav'
import VolumetriaClient from '@/components/volumetria/VolumetriaClient'

export default async function VolumetriaPage() {
  const session = await getSession()
  // Criar é de turno; editar/excluir é de ADMIN (§4). A API nega igual.
  const role = session?.role ?? ''
  return (
    <div className="space-y-8">
      <CarteiraNav
        podeVerCertificados={!!session &&
          hasPermission(session.permissoes ?? null, 'view_certificates', session.role)}
      />
      <VolumetriaClient
        podeCriar={podeCriarVolumetria(role)}
        podeAdministrar={podeAdministrarVolumetria(role)}
      />
    </div>
  )
}
