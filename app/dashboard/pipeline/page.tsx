export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeAdministrarPipeline } from '@/lib/pipeline'
import PipelineClient from './PipelineClient'

export default async function PipelinePage() {
  const session = await getSession()
  /**
   * Os leads do seletor trazem SEGMENTO e CNPJ porque a busca filtra por eles
   * — e o segmento também aparece na opção, para distinguir duas empresas de
   * nome parecido sem abrir o cadastro.
   *
   * Ordenado por empresa, que é como se procura: o executivo é a segunda
   * pista, não a primeira.
   */
  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, company: true, cnpj: true, segmento: true },
    orderBy: [{ company: 'asc' }, { name: 'asc' }],
  })

  return (
    <PipelineClient
      leads={leads}
      podeAdministrar={!!session && podeAdministrarPipeline(session)}
    />
  )
}
