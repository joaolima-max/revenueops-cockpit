import { formatCurrency, formatTPV, formatPercent, formatMesRef } from '@/lib/utils'

function Sparkline({ values, color, w = 80, h = 32 }: { values: number[], color: string, w?: number, h?: number }) {
  const pos = values.filter(v => isFinite(v) && v > 0)
  if (pos.length < 2) return <span style={{ display: 'inline-block', width: w, height: h }} />
  const min = Math.min(...pos)
  const max = Math.max(...pos)
  const range = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - 2 - ((Math.max(v, 0) - min) / range) * (h - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" opacity={0.6} />
    </svg>
  )
}

function Delta({
  current, prev, unit = 'currency', small,
}: {
  current: number, prev: number,
  unit?: 'currency' | 'percent' | 'number',
  small?: boolean,
}) {
  if (!prev || !isFinite(current / prev)) return null
  const delta = current - prev
  const pct = (delta / Math.abs(prev)) * 100
  const up = delta >= 0
  const color = up ? 'text-emerald-400' : 'text-red-400'
  const arrow = up ? '▲' : '▼'
  let abs = ''
  if (unit === 'currency') abs = formatCurrency(Math.abs(delta))
  else if (unit === 'percent') abs = `${Math.abs(delta).toFixed(2)}pp`
  else abs = Math.abs(Math.round(delta)).toLocaleString('pt-BR')

  if (small) {
    return (
      <span className={`text-[10px] font-medium ${color}`}>
        {arrow} {(up ? '+' : '')}{pct.toFixed(1)}%
      </span>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      <span className="font-semibold">{arrow} {(up ? '+' : '')}{pct.toFixed(1)}%</span>
      <span className="text-gray-700">·</span>
      <span className="text-gray-500">{up ? '+' : '−'}{abs} vs mês ant.</span>
    </div>
  )
}

export interface KpiTrends {
  faturamento: number[]
  tpv: number[]
  mrr: number[]
  takeRate: number[]
  receita: number[]
  floating: number[]
  margem: number[]
}

export interface KpiPrevMonth {
  faturamento: number
  tpv: number
  mrr: number
  takeRate: number
  receita: number
  floating: number
  margemOp: number
  mes: string
}

interface KpiEvolvedProps {
  kpis: {
    receita: number
    receitaTarifariaWlMes: number
    floating: number
    mrr: number
    mrrApi: number
    mrrWl: number
    setups: number
    tpv: number
    takeRate: number
    pmp: number
    med: number
    margemOp: number | null
    margemTransacional: number | null
    precisao: number
    qtdTx: number
    clientesAtivos: number
    churn: number
  }
  metas: {
    receita: { valor: number } | null
    tpv: { valor: number } | null
    mrr: { valor: number } | null
  }
  trends: KpiTrends
  prevMonth: KpiPrevMonth
  mesAtual: string
}

function PrimaryCard({
  label, formatted, value, sub, color, accentBg, sparkColor, sparkValues,
  prevValue, unit, meta, metaVal,
}: {
  label: string, formatted: string, value: number, sub: string,
  color: string, accentBg: string, sparkColor: string, sparkValues: number[],
  prevValue: number, unit?: 'currency' | 'percent' | 'number',
  meta?: { valor: number } | null, metaVal?: number,
}) {
  const mv = metaVal ?? value
  const pct = meta && mv > 0 ? (mv / meta.valor) * 100 : null
  const barPct = pct !== null ? Math.min(pct, 100) : 0
  const barColor = pct === null ? '#374151' : pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444'
  const falta = meta && pct !== null && pct < 100 ? meta.valor - mv : null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="text-gray-500 text-[11px] font-medium tracking-wide uppercase leading-none">{label}</span>
        <div className={`w-6 h-6 rounded-lg ${accentBg} flex-shrink-0`} />
      </div>

      <div className="flex items-end justify-between gap-2">
        <p className={`text-2xl font-bold ${color} leading-none`}>{formatted}</p>
        {sparkValues.length > 1 && (
          <Sparkline values={sparkValues} color={sparkColor} w={72} h={28} />
        )}
      </div>

      <Delta current={value} prev={prevValue} unit={unit} />

      {pct !== null && (
        <div>
          <div className="flex justify-between items-center text-[11px] mb-1.5">
            <span className="text-gray-700">Meta {meta ? formatCurrency(meta.valor) : ''}</span>
            <span style={{ color: barColor }} className="font-semibold">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-[3px] bg-gray-800 rounded-full">
            <div className="h-[3px] rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
          </div>
          {falta !== null && falta > 0 && (
            <p className="text-[10px] text-gray-700 mt-1">Falta {formatCurrency(falta)}</p>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-700 leading-tight">{sub}</p>
    </div>
  )
}

function SecondaryCard({
  label, formatted, color, sparkColor, sparkValues, currentValue, prevValue, unit,
}: {
  label: string, formatted: string, color: string,
  sparkColor?: string, sparkValues?: number[],
  currentValue?: number, prevValue?: number,
  unit?: 'currency' | 'percent' | 'number',
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-600 text-[10px] font-medium tracking-wide uppercase mb-2">{label}</p>
      <p className={`text-base font-bold ${color} leading-none mb-2`}>{formatted}</p>
      {sparkValues && sparkValues.length > 1 && sparkColor && (
        <Sparkline values={sparkValues} color={sparkColor} w={80} h={22} />
      )}
      {currentValue !== undefined && prevValue !== undefined && prevValue > 0 && (
        <div className="mt-1.5">
          <Delta current={currentValue} prev={prevValue} unit={unit} small />
        </div>
      )}
    </div>
  )
}

export default function KpiEvolved({ kpis, metas, trends, prevMonth, mesAtual }: KpiEvolvedProps) {
  const fatAtual = kpis.receita + kpis.receitaTarifariaWlMes + kpis.floating + kpis.mrr + kpis.setups

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <PrimaryCard
          label={`Faturamento ${formatMesRef(mesAtual)}`}
          value={fatAtual}
          formatted={formatCurrency(fatAtual)}
          sub="Tarifária + WL + Floating + MRR + Setups"
          color="text-indigo-400"
          accentBg="bg-indigo-500/10"
          sparkColor="#6366f1"
          sparkValues={trends.faturamento}
          prevValue={prevMonth.faturamento}
          unit="currency"
          meta={metas.receita}
          metaVal={fatAtual}
        />
        <PrimaryCard
          label="MRR"
          value={kpis.mrr}
          formatted={formatCurrency(kpis.mrr)}
          sub={`API ${formatCurrency(kpis.mrrApi)} · WL ${formatCurrency(kpis.mrrWl)}`}
          color="text-emerald-400"
          accentBg="bg-emerald-500/10"
          sparkColor="#10b981"
          sparkValues={trends.mrr}
          prevValue={prevMonth.mrr}
          unit="currency"
          meta={metas.mrr}
          metaVal={kpis.mrr}
        />
        <PrimaryCard
          label={`TPV ${formatMesRef(mesAtual)}`}
          value={kpis.tpv}
          formatted={formatTPV(kpis.tpv)}
          sub="Volume processado no mês"
          color="text-sky-400"
          accentBg="bg-sky-500/10"
          sparkColor="#0ea5e9"
          sparkValues={trends.tpv}
          prevValue={prevMonth.tpv}
          unit="currency"
          meta={metas.tpv}
          metaVal={kpis.tpv}
        />
        <PrimaryCard
          label="Clientes Ativos"
          value={kpis.clientesAtivos}
          formatted={String(kpis.clientesAtivos)}
          sub={kpis.churn > 0 ? `${kpis.churn} churn este mês` : 'Sem churn este mês'}
          color="text-violet-400"
          accentBg="bg-violet-500/10"
          sparkColor="#8b5cf6"
          sparkValues={[]}
          prevValue={0}
          unit="number"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <SecondaryCard
          label="Take Rate"
          formatted={kpis.takeRate > 0 ? formatPercent(kpis.takeRate, 3) : '—'}
          color="text-amber-400"
          sparkColor="#f59e0b"
          sparkValues={trends.takeRate}
          currentValue={kpis.takeRate}
          prevValue={prevMonth.takeRate}
          unit="percent"
        />
        <SecondaryCard
          label="PMP (Preço Médio Pix)"
          formatted={kpis.pmp > 0 ? formatCurrency(kpis.pmp) : '—'}
          color="text-violet-400"
        />
        <SecondaryCard
          label="Margem Transacional"
          formatted={kpis.margemTransacional !== null ? formatPercent(kpis.margemTransacional, 1) : '—'}
          color={
            kpis.margemTransacional !== null && kpis.margemTransacional >= 60
              ? 'text-emerald-400'
              : kpis.margemTransacional !== null
              ? 'text-amber-400'
              : 'text-gray-600'
          }
        />
        <SecondaryCard
          label="Margem Operacional"
          formatted={kpis.margemOp !== null ? formatPercent(kpis.margemOp, 2) : '—'}
          color={
            kpis.margemOp !== null && kpis.margemOp >= 30
              ? 'text-emerald-400'
              : kpis.margemOp !== null
              ? 'text-amber-400'
              : 'text-gray-600'
          }
          sparkColor="#10b981"
          sparkValues={trends.margem}
          currentValue={kpis.margemOp ?? undefined}
          prevValue={prevMonth.margemOp}
          unit="percent"
        />
        <SecondaryCard
          label="MED Médio"
          formatted={kpis.qtdTx > 0 ? formatPercent(kpis.med, 2) : '—'}
          color="text-sky-400"
        />
        <SecondaryCard
          label="Precisão Forecast"
          formatted={kpis.precisao > 0 ? formatPercent(kpis.precisao, 1) : '—'}
          color={
            kpis.precisao >= 90
              ? 'text-emerald-400'
              : kpis.precisao > 0
              ? 'text-amber-400'
              : 'text-gray-600'
          }
        />
      </div>
    </>
  )
}
