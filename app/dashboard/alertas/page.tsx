export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatMesRef } from '@/lib/utils'
import {
  kpisDoPeriodo, volumetriaDoPeriodo, periodoAtual, ultimosPeriodos, intervaloMes,
  type VolumetriaPeriodo,
} from '@/lib/kpi'

/**
 * O mínimo do mês passou a ser a soma das exigências contratuais dos clientes
 * vigentes. Dizer de onde ele veio evita que o alerta pareça um número mágico,
 * e distingue os meses antigos, que ainda usam o contrato geral legado.
 */
function origemVolumetria(v: VolumetriaPeriodo): string {
  if (v.origem !== 'CLIENTES') return ' (contrato geral)'
  return ` (soma de ${v.clientes} ${v.clientes === 1 ? 'cliente' : 'clientes'})`
}

type Severidade = 'critico' | 'atencao' | 'info'

interface Alerta {
  id: string
  severidade: Severidade
  titulo: string
  detalhe: string
  href?: string
}

const ESTILO: Record<Severidade, { cls: string; label: string }> = {
  critico: { cls: 'border-red-500/25 bg-red-500/5', label: 'Crítico' },
  atencao: { cls: 'border-amber-400/25 bg-amber-400/5', label: 'Atenção' },
  info: { cls: 'border-sky-500/25 bg-sky-500/5', label: 'Informativo' },
}

const COR_PILL: Record<Severidade, string> = {
  critico: 'bg-red-500/15 text-red-400',
  atencao: 'bg-amber-400/15 text-amber-300',
  info: 'bg-sky-500/15 text-sky-300',
}

export default async function AlertasPage() {
  const periodo = periodoAtual()
  const { inicio, fim } = intervaloMes(periodo)
  const anterior = ultimosPeriodos(2)[0]

  const [kpis, volumetria, volumetriaAnterior, vencidas, incidentesAbertos, semFloatConfig] =
    await Promise.all([
      kpisDoPeriodo(periodo),
      volumetriaDoPeriodo(periodo),
      volumetriaDoPeriodo(anterior),
      prisma.contaReceber.findMany({
        where: { status: { not: 'PAGO' }, dataVenc: { lt: new Date() } },
        include: { cliente: { select: { nome: true } } },
        orderBy: { dataVenc: 'asc' },
        take: 20,
      }),
      prisma.incidente.count({ where: { fim: null } }),
      prisma.floatConfig.count(),
    ])

  const alertas: Alerta[] = []

  // Fechamento do mês anterior: a conferência de volumetria que a Parte 7 pede
  if (volumetriaAnterior && volumetriaAnterior.status === 'NAO_ATINGIDO') {
    alertas.push({
      id: 'vol-anterior',
      severidade: 'critico',
      titulo: `Volumetria mínima não atingida em ${formatMesRef(anterior)}`,
      detalhe: `Faltaram ${Math.abs(volumetriaAnterior.diferenca ?? 0).toLocaleString('pt-BR')} transações para o mínimo contratado de ${volumetriaAnterior.qtdMinima.toLocaleString('pt-BR')}${origemVolumetria(volumetriaAnterior)}.`,
      href: '/dashboard/volumetria',
    })
  }

  if (volumetria && volumetria.status === 'EM_ACOMPANHAMENTO') {
    alertas.push({
      id: 'vol-atual',
      severidade: 'atencao',
      titulo: 'Volumetria mínima do mês ainda não atingida',
      detalhe: `Faltam ${Math.abs(volumetria.diferenca ?? 0).toLocaleString('pt-BR')} transações para o mínimo de ${volumetria.qtdMinima.toLocaleString('pt-BR')}${origemVolumetria(volumetria)}. O mês ainda está em curso.`,
      href: '/dashboard/volumetria',
    })
  }

  // Lançamentos pendentes
  const diaDeHoje = new Date().getUTCDate()
  const ultimoDia = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0)).getUTCDate()
  const decorridos = Math.min(diaDeHoje, ultimoDia)
  const faltando = decorridos - kpis.diasLancados
  if (faltando > 0) {
    alertas.push({
      id: 'lancamentos',
      severidade: faltando >= 3 ? 'atencao' : 'info',
      titulo: `${faltando} ${faltando === 1 ? 'dia sem lançamento' : 'dias sem lançamento'}`,
      detalhe: `${kpis.diasLancados} de ${decorridos} dias decorridos foram registrados. Sem lançamento, os KPIs do período ficam incompletos.`,
      href: '/dashboard/forecast',
    })
  }

  if (semFloatConfig === 0) {
    alertas.push({
      id: 'float-config',
      severidade: 'critico',
      titulo: 'Multiplicador do Float não configurado',
      detalhe: 'Sem multiplicador vigente o Float não é calculado, e o faturamento fica subestimado.',
      href: '/dashboard/parametros',
    })
  }

  if (vencidas.length > 0) {
    const total = vencidas.reduce((s, c) => s + c.valor, 0)
    alertas.push({
      id: 'inadimplencia',
      severidade: 'critico',
      titulo: `${vencidas.length} ${vencidas.length === 1 ? 'cobrança vencida' : 'cobranças vencidas'}`,
      detalhe: `${formatCurrency(total)} em aberto. Cliente mais antigo: ${vencidas[0].cliente.nome}.`,
      href: '/dashboard/financeiro',
    })
  }

  if (incidentesAbertos > 0) {
    alertas.push({
      id: 'incidentes',
      severidade: incidentesAbertos >= 3 ? 'critico' : 'atencao',
      titulo: `${incidentesAbertos} ${incidentesAbertos === 1 ? 'incidente em aberto' : 'incidentes em aberto'}`,
      detalhe: 'Incidentes sem data de encerramento seguem contando downtime.',
      href: '/dashboard/incidentes',
    })
  }

  const ordem: Record<Severidade, number> = { critico: 0, atencao: 1, info: 2 }
  alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-bold text-white">Alertas</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          Verificações automáticas sobre lançamentos, volumetria, cobranças e operação.
        </p>
      </div>

      {alertas.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-white font-medium">Nenhum alerta no momento</p>
          <p className="text-gray-600 text-sm mt-1">
            Lançamentos em dia, volumetria dentro do contratado e nenhuma cobrança vencida.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alertas.map((a) => {
            const e = ESTILO[a.severidade]
            const conteudo = (
              <div className={`border rounded-xl p-4 ${e.cls} ${a.href ? 'hover:border-opacity-60 transition-colors' : ''}`}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="text-sm font-semibold text-white">{a.titulo}</h3>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${COR_PILL[a.severidade]}`}>
                    {e.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{a.detalhe}</p>
              </div>
            )
            return a.href
              ? <Link key={a.id} href={a.href} className="block">{conteudo}</Link>
              : <div key={a.id}>{conteudo}</div>
          })}
        </div>
      )}
    </div>
  )
}
