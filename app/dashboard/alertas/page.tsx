export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatCurrency, formatTPV, getCurrentMonth, formatMesRef } from '@/lib/utils'

type AlertLevel = 'critico' | 'alto' | 'medio' | 'info'

interface Alerta {
  id: string
  nivel: AlertLevel
  titulo: string
  descricao: string
  clienteId?: string
  clienteNome?: string
  valor?: string
}

async function getAlertas() {
  const mesAtual = getCurrentMonth()
  const [clientes, processamentos, metas, incidentes] = await Promise.all([
    prisma.cliente.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, nome: true, tpvEsperado: true, qtdMedEsperada: true, receitaPrevistaMensal: true, volumeMinimo: true, scoreRisco: true },
    }),
    prisma.processamento.findMany({
      where: { mesRef: mesAtual },
      select: { clienteId: true, tpv: true, qtdTransacoes: true, qtdMed: true, receitaTarifaria: true },
    }),
    prisma.meta.findMany({ where: { periodo: mesAtual } }),
    prisma.incidente.findMany({
      where: { fim: null },
      include: { clientesAfetados: { include: { cliente: { select: { nome: true } } } } },
      orderBy: { inicio: 'desc' },
      take: 5,
    }),
  ])

  const procMap = new Map(processamentos.map(p => [p.clienteId, p]))
  const alertas: Alerta[] = []

  // Incidentes em aberto
  for (const inc of incidentes) {
    alertas.push({
      id: `inc-${inc.id}`,
      nivel: inc.criticidade === 'CRITICA' ? 'critico' : inc.criticidade === 'ALTA' ? 'alto' : 'medio',
      titulo: `Incidente em aberto: ${inc.titulo}`,
      descricao: `Iniciado em ${new Date(inc.inicio).toLocaleDateString('pt-BR')} · ${inc.clientesAfetados.length} cliente(s) afetado(s)`,
    })
  }

  // Clientes com score crítico
  for (const c of clientes.filter(c => c.scoreRisco === 'CRITICO')) {
    alertas.push({
      id: `score-${c.id}`, nivel: 'critico',
      titulo: `Risco Crítico: ${c.nome}`,
      descricao: 'Cliente com score de risco crítico. Atenção imediata recomendada.',
      clienteId: c.id, clienteNome: c.nome,
    })
  }

  // MED alto (> 2%)
  for (const c of clientes) {
    const proc = procMap.get(c.id)
    if (proc && proc.qtdTransacoes > 0) {
      const med = (proc.qtdMed / proc.qtdTransacoes) * 100
      if (med > 2) {
        alertas.push({
          id: `med-${c.id}`, nivel: med > 5 ? 'critico' : 'alto',
          titulo: `MED elevado: ${c.nome}`,
          descricao: `MED ${med.toFixed(2)}% em ${formatMesRef(mesAtual)} — limite recomendado: 2%`,
          clienteId: c.id, clienteNome: c.nome, valor: `${med.toFixed(2)}%`,
        })
      }
    }
  }

  // Volume mínimo não atingido
  for (const c of clientes) {
    const proc = procMap.get(c.id)
    if (c.volumeMinimo && c.volumeMinimo > 0) {
      const tpv = proc?.tpv || 0
      if (tpv < c.volumeMinimo) {
        const pct = (tpv / c.volumeMinimo) * 100
        alertas.push({
          id: `vol-${c.id}`, nivel: pct < 50 ? 'alto' : 'medio',
          titulo: `Abaixo do volume mínimo: ${c.nome}`,
          descricao: `TPV ${formatTPV(tpv)} de ${formatTPV(c.volumeMinimo)} contratado (${pct.toFixed(0)}%)`,
          clienteId: c.id, clienteNome: c.nome,
        })
      }
    }
  }

  // Meta de receita distante
  const metaReceita = metas.find(m => m.tipo === 'RECEITA')
  if (metaReceita) {
    const receitaAtual = processamentos.reduce((s, p) => s + p.receitaTarifaria, 0)
    const pct = metaReceita.valor > 0 ? (receitaAtual / metaReceita.valor) * 100 : 0
    if (pct < 70) {
      alertas.push({
        id: 'meta-receita', nivel: pct < 50 ? 'alto' : 'medio',
        titulo: 'Meta de Receita em risco',
        descricao: `${pct.toFixed(0)}% da meta atingida — ${formatCurrency(receitaAtual)} de ${formatCurrency(metaReceita.valor)}`,
      })
    }
  }

  // Clientes com score alto
  for (const c of clientes.filter(c => c.scoreRisco === 'ALTO')) {
    alertas.push({
      id: `score-alto-${c.id}`, nivel: 'medio',
      titulo: `Risco Alto: ${c.nome}`,
      descricao: 'Monitoramento recomendado — score de risco elevado.',
      clienteId: c.id, clienteNome: c.nome,
    })
  }

  if (alertas.length === 0) {
    alertas.push({
      id: 'ok', nivel: 'info',
      titulo: 'Nenhum alerta ativo',
      descricao: 'Todos os indicadores estão dentro dos parâmetros normais.',
    })
  }

  return alertas.sort((a, b) => {
    const order: Record<AlertLevel, number> = { critico: 0, alto: 1, medio: 2, info: 3 }
    return order[a.nivel] - order[b.nivel]
  })
}

const nivelConfig: Record<AlertLevel, { label: string; bg: string; text: string; border: string; dot: string }> = {
  critico: { label: 'Crítico', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: 'bg-red-500' },
  alto: { label: 'Alto', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-500' },
  medio: { label: 'Médio', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-500' },
  info: { label: 'Info', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
}

export default async function AlertasPage() {
  const session = await getSession()
  const alertas = await getAlertas()

  const criticos = alertas.filter(a => a.nivel === 'critico').length
  const altos = alertas.filter(a => a.nivel === 'alto').length
  const medios = alertas.filter(a => a.nivel === 'medio').length

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Central de Alertas</h1>
        <p className="text-gray-600 text-sm mt-0.5">Monitoramento automático de indicadores críticos</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Críticos', count: criticos, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Altos', count: altos, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          { label: 'Médios', count: medios, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-gray-800 rounded-xl p-4`}>
            <p className="text-gray-500 text-xs mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.count}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {alertas.map(alerta => {
          const cfg = nivelConfig[alerta.nivel]
          return (
            <div key={alerta.id} className={`${cfg.bg} border ${cfg.border} rounded-xl p-4 flex items-start gap-4`}>
              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                <div className={`w-2 h-2 rounded-full ${cfg.dot} ${alerta.nivel === 'critico' ? 'animate-pulse' : ''}`} />
                <span className={`text-xs font-semibold ${cfg.text} w-12`}>{cfg.label}</span>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{alerta.titulo}</p>
                <p className="text-gray-500 text-xs mt-0.5">{alerta.descricao}</p>
              </div>
              {alerta.clienteNome && (
                <span className="text-xs text-gray-600 flex-shrink-0">{alerta.clienteNome}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
