'use client'

import { useState, useMemo, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatTPV, formatPercent } from '@/lib/utils'

export interface LancamentoDTO {
  data: string
  receitaTarifaria: number
  tpv: number
  saldoEmConta: number
  qtdTransacoes: number
  qtdMed: number
  notas: string | null
}

export interface KpisDTO {
  temDados: boolean
  diasLancados: number
  tpv: number | null
  receitaTarifaria: number | null
  qtdTransacoes: number | null
  qtdMed: number | null
  saldoMedio: number | null
  float: number | null
  takeRate: number | null
  percentMed: number | null
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const CAMPOS = [
  { nome: 'receitaTarifaria', label: 'Receita Tarifária', prefixo: 'R$', decimal: true },
  { nome: 'tpv', label: 'TPV Geral', prefixo: 'R$', decimal: true },
  { nome: 'saldoEmConta', label: 'Saldo em Conta', prefixo: 'R$', decimal: true },
  { nome: 'qtdTransacoes', label: 'Qtd. Transações', prefixo: '', decimal: false },
  { nome: 'qtdMed', label: 'Qtd. MEDs', prefixo: '', decimal: false },
] as const

function deslocaPeriodo(periodo: string, meses: number): string {
  const [a, m] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + meses, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function CalendarioLancamentos({
  periodo, lancamentos, kpis, podeEditar, podeExcluir,
}: {
  periodo: string
  lancamentos: LancamentoDTO[]
  kpis: KpisDTO
  podeEditar: boolean
  podeExcluir: boolean
}) {
  const router = useRouter()
  const [ano, mes] = periodo.split('-').map(Number)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [notas, setNotas] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const porData = useMemo(
    () => new Map(lancamentos.map((l) => [l.data, l])),
    [lancamentos]
  )

  const celulas = useMemo(() => {
    const primeiro = new Date(Date.UTC(ano, mes - 1, 1))
    const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    const vazias = primeiro.getUTCDay()
    return [
      ...Array.from({ length: vazias }, () => null),
      ...Array.from({ length: totalDias }, (_, i) => {
        const dia = i + 1
        return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      }),
    ]
  }, [ano, mes])

  function abrir(iso: string) {
    if (!podeEditar) return
    if (iso > hojeISO()) return
    const existente = porData.get(iso)
    setSelecionada(iso)
    setErro('')
    setNotas(existente?.notas ?? '')
    setForm(
      Object.fromEntries(
        CAMPOS.map((c) => [c.nome, existente ? String(existente[c.nome as keyof LancamentoDTO] ?? '') : ''])
      )
    )
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!selecionada) return
    setSalvando(true)
    setErro('')
    try {
      const res = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: selecionada, ...form, notas }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error ?? 'Erro ao salvar'); return }
      setSelecionada(null)
      router.refresh()
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!selecionada) return
    setSalvando(true)
    try {
      const res = await fetch(`/api/forecast?data=${selecionada}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); setErro(j.error ?? 'Erro ao excluir'); return }
      setSelecionada(null)
      router.refresh()
    } finally {
      setSalvando(false)
    }
  }

  const resumo = [
    { label: 'TPV', valor: kpis.tpv, fmt: formatTPV },
    { label: 'Receita Tarifária', valor: kpis.receitaTarifaria, fmt: formatCurrency },
    { label: 'Float (derivado)', valor: kpis.float, fmt: formatCurrency },
    { label: 'Saldo Médio', valor: kpis.saldoMedio, fmt: formatCurrency },
    { label: 'Transações', valor: kpis.qtdTransacoes, fmt: (v: number) => v.toLocaleString('pt-BR') },
    { label: 'Take Rate', valor: kpis.takeRate, fmt: (v: number) => formatPercent(v, 3) },
  ]

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Lançamento Diário</h1>
          <p className="text-gray-600 text-sm mt-0.5">
            Registro do realizado. O Float é calculado automaticamente a partir do saldo em conta.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push(`/dashboard/forecast?periodo=${deslocaPeriodo(periodo, -1)}`)}
            className="px-2.5 py-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md text-sm transition-colors"
            aria-label="Mês anterior"
          >←</button>
          <span className="text-white text-sm font-medium px-3 tabular-nums">
            {MESES[mes - 1]} {ano}
          </span>
          <button
            onClick={() => router.push(`/dashboard/forecast?periodo=${deslocaPeriodo(periodo, 1)}`)}
            className="px-2.5 py-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md text-sm transition-colors"
            aria-label="Próximo mês"
          >→</button>
        </div>
      </div>

      {kpis.temDados ? (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          {resumo.map((r) => (
            <div key={r.label} className="bg-gray-900 border border-gray-800/60 rounded-xl p-4">
              <p className="text-xs text-gray-600 mb-1">{r.label}</p>
              <p className="text-lg font-bold text-white tabular-nums">
                {r.valor === null ? <span className="text-gray-700 text-sm font-normal">sem dados</span> : r.fmt(r.valor)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-white font-medium">Nenhum lançamento em {MESES[mes - 1]} de {ano}</p>
          <p className="text-gray-600 text-sm mt-1">
            {podeEditar
              ? 'Clique em um dia do calendário para registrar os indicadores do dia.'
              : 'Seu perfil não tem permissão para lançar dados.'}
          </p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-gray-700 tracking-widest py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {celulas.map((iso, i) => {
            if (!iso) return <div key={`v${i}`} />
            const l = porData.get(iso)
            const futuro = iso > hojeISO()
            const hoje = iso === hojeISO()
            return (
              <button
                key={iso}
                onClick={() => abrir(iso)}
                disabled={futuro || !podeEditar}
                className={[
                  'aspect-square rounded-lg border p-2 text-left transition-colors flex flex-col justify-between',
                  futuro
                    ? 'border-gray-800/40 bg-transparent cursor-not-allowed opacity-30'
                    : l
                      ? 'border-blue-600/30 bg-blue-600/10 hover:border-blue-500/60'
                      : 'border-gray-800 bg-gray-950/40 hover:border-gray-700',
                  hoje ? 'ring-1 ring-blue-500/40' : '',
                  !podeEditar && !futuro ? 'cursor-default' : '',
                ].join(' ')}
              >
                <span className={`text-xs tabular-nums ${l ? 'text-blue-300 font-semibold' : 'text-gray-600'}`}>
                  {Number(iso.slice(8))}
                </span>
                {l && (
                  <span className="text-[9px] text-gray-500 leading-tight truncate">
                    {formatTPV(l.tpv)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selecionada && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setSelecionada(null)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={salvar} className="p-5 space-y-4">
              <div>
                <h2 className="text-white font-semibold">
                  {new Date(selecionada + 'T00:00:00Z').toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
                  })}
                </h2>
                <p className="text-gray-600 text-xs mt-0.5">
                  {porData.has(selecionada) ? 'Editando lançamento existente' : 'Novo lançamento'}
                </p>
              </div>

              {erro && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-xs">{erro}</div>
              )}

              <div className="space-y-3">
                {CAMPOS.map((c) => (
                  <div key={c.nome}>
                    <label className="block text-xs text-gray-500 mb-1">{c.label}</label>
                    <div className="relative">
                      {c.prefixo && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">{c.prefixo}</span>
                      )}
                      <input
                        type="number"
                        step={c.decimal ? '0.01' : '1'}
                        min="0"
                        value={form[c.nome] ?? ''}
                        onChange={(e) => setForm({ ...form, [c.nome]: e.target.value })}
                        className={`w-full ${c.prefixo ? 'pl-9' : 'pl-3'} pr-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Observações</label>
                  <input
                    type="text"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    maxLength={500}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                {podeExcluir && porData.has(selecionada) && (
                  <button
                    type="button"
                    onClick={excluir}
                    disabled={salvando}
                    className="px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm disabled:opacity-50 transition-colors"
                  >
                    Excluir
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelecionada(null)}
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
