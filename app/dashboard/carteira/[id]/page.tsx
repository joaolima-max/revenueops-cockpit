export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ClienteDetailClient from './ClienteDetailClient'

const MES_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Idade do contrato, em meses.
 *
 * Fica FORA do componente de propósito: ler o relógio dentro do corpo de um
 * componente é leitura impura durante a renderização — o valor muda a cada
 * render e diverge entre o HTML do servidor e o do cliente. Aqui a leitura
 * acontece uma vez por requisição, e a idade do contrato é dado do cliente,
 * não estado de tela.
 */
function mesesDesde(data: Date | null): number {
  if (!data) return 0
  return Math.floor((Date.now() - data.getTime()) / MES_MS)
}

/** Vencimento já passou? Mesma razão de `mesesDesde` para viver aqui fora. */
function jaVenceu(data: Date): boolean {
  return data.getTime() < Date.now()
}

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()

  const [cliente, users] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        tarefas: {
          orderBy: { createdAt: 'desc' },
          include: {
            responsavel: { select: { id: true, name: true } },
            criadoPor: { select: { id: true, name: true } },
          },
        },
        contasReceber: { orderBy: { dataVenc: 'desc' } },
        followUps: { orderBy: { proximoContato: 'asc' } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!cliente) notFound()

  // LTV e CAC saíram: vinham do ambiente "Parâmetros", que não existe mais, e
  // já eram props mortas — a tela de detalhe recebia os três valores e não
  // renderizava nenhum deles.
  const mrr = cliente.mensalidadeApi ?? 0
  const mesesDesdeFechamento = mesesDesde(cliente.dataFechamento)

  // Score de saúde sobre sinais que pertencem ao cliente.
  let healthScore = 40
  if (cliente.status === 'ATIVO') healthScore += 25
  if (mrr > 0) healthScore += 15
  if (cliente.dataFechamento) healthScore += 10
  if (cliente.contasReceber.some((c) => c.status === 'INADIMPLENTE')) healthScore -= 30
  if (cliente.contasReceber.some((c) => c.status !== 'PAGO' && jaVenceu(c.dataVenc))) healthScore -= 10
  healthScore = Math.max(0, Math.min(100, healthScore))

  return (
    <ClienteDetailClient
      cliente={JSON.parse(JSON.stringify(cliente))}
      users={users}
      role={session?.role || 'OPERACIONAL'}
      currentUserId={session?.userId || ''}
      healthScore={healthScore}
      mesesDesdeFechamento={mesesDesdeFechamento}
    />
  )
}
