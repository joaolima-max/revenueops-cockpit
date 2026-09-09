export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { podeAdministrarPipeline } from '@/lib/pipeline'
import { acessoAoFunil } from '@/lib/pipeline-db'
import FunilDetailClient from './FunilDetailClient'

export default async function FunilDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !podeAdministrarPipeline(session)) redirect('/dashboard/pipeline')

  const { id } = await params
  const acesso = await acessoAoFunil(session, id)
  if (!acesso) redirect('/dashboard/pipeline/funis')
  if (!acesso.administrar) redirect('/dashboard/pipeline')

  return <FunilDetailClient funilId={id} />
}
