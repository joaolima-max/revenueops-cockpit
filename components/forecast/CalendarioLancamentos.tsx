'use client'

import { useState, useMemo, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { figuraMoeda, figuraQuantidade, figuraPercentual, moedaCompacta } from '@/lib/format-financeiro'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'

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
    { label: 'TPV', fig: kpis.tpv === null ? null : figuraMoeda(kpis.tpv) },
    { label: 'Receita Tarifária', fig: kpis.receitaTarifaria === null ? null : figuraMoeda(kpis.receitaTarifaria) },
    { label: 'Float (derivado)', fig: kpis.float === null ? null : figuraMoeda(kpis.float) },
    { label: 'Saldo Médio', fig: kpis.saldoMedio === null ? null : figuraMoeda(kpis.saldoMedio) },
    { label: 'Transações', fig: kpis.qtdTransacoes === null ? null : figuraQuantidade(kpis.qtdTransacoes) },
    { label: 'Take Rate', fig: kpis.takeRate === null ? null : figuraPercentual(kpis.takeRate, 3) },
  ]


  return (
    <div className="space-y-8">
      <PageHeader
        title="Lançamento Diário"
        sub="Registro do realizado. O Float é calculado automaticamente a partir do saldo em conta."
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-line p-1">
            <button
              onClick={() => router.push(`/dashboard/forecast?periodo=${deslocaPeriodo(periodo, -1)}`)}
              className="w-8 h-8 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-[var(--bp-hover)] transition-colors duration-[180ms]"
              aria-label="Mês anterior"
            >←</button>
            <span className="t-label text-fg px-3 tabular-nums whitespace-nowrap">
              {MESES[mes - 1]} {ano}
            </span>
            <button
              onClick={() => router.push(`/dashboard/forecast?periodo=${deslocaPeriodo(periodo, 1)}`)}
              className="w-8 h-8 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-[var(--bp-hover)] transition-colors duration-[180ms]"
              aria-label="Próximo mês"
            >→</button>
          </div>
        }
      />

      {kpis.temDados ? (
        <HairlineGrid cols={6}>
          {resumo.map((r, i) => (
            <StatTile key={r.label} label={r.label} figura={r.fig} primary={i === 0} size="sm" />
          ))}
        </HairlineGrid>
      ) : (
        <Panel padded={false}>
          <EmptyState
            title={`Nenhum lançamento em ${MESES[mes - 1]} de ${ano}`}
            description={
              podeEditar
                ? 'Selecione um dia do calendário para registrar os indicadores.'
                : 'Seu perfil não tem permissão para lançar dados.'
            }
          />
        </Panel>
      )}

      <Panel>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-3">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className="text-center t-label text-subtle/70 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
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
                title={l ? `${figuraMoeda(l.tpv).completo} · ${figuraQuantidade(l.qtdTransacoes).completo} transações` : undefined}
                className={cn(
                  'aspect-square rounded-xl border p-1.5 sm:p-2.5 text-left flex flex-col justify-between',
                  'transition-[background-color,border-color] duration-[180ms] ease-bp',
                  futuro
                    ? 'border-line/50 bg-transparent opacity-30 cursor-not-allowed'
                    : l
                      // Dia lançado: banho do accent institucional.
                      ? 'border-accent/30 bg-[var(--bp-accent-wash)] hover:border-accent/60 hover:bg-accent/15'
                      : 'border-line bg-[var(--bp-hover)] hover:bg-surface-2 hover:border-line-2',
                  hoje && 'ring-1 ring-accent/50 ring-offset-0',
                  !podeEditar && !futuro && 'cursor-default'
                )}
              >
                <span className={cn(
                  'text-[0.75rem] tabular-nums leading-none',
                  l ? 'text-accent-soft font-semibold' : 'text-subtle'
                )}>
                  {Number(iso.slice(8))}
                </span>
                {l && (
                  <span className="hidden sm:block text-[0.625rem] text-muted leading-tight truncate tabular-nums">
                    {moedaCompacta(l.tpv)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Panel>

      {selecionada && (
        <div
          className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelecionada(null)}
        >
          <div
            className="bg-surface border border-line-2 rounded-3xl w-full max-w-md shadow-[var(--bp-shadow-overlay)] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={salvar} className="p-6 space-y-5">
              <div className="pb-4 border-b border-line">
                <h2 className="t-h2 text-fg capitalize">
                  {new Date(selecionada + 'T00:00:00Z').toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
                  })}
                </h2>
                <p className="t-label text-subtle mt-1.5">
                  {porData.has(selecionada) ? 'Editando lançamento' : 'Novo lançamento'}
                </p>
              </div>

              {erro && (
                <div className="bg-neg/10 border border-neg/25 text-neg px-3.5 py-2.5 rounded-lg t-sm">{erro}</div>
              )}

              <div className="space-y-4">
                {CAMPOS.map((c) => (
                  <div key={c.nome}>
                    <label className="bp-field-label">{c.label}</label>
                    <div className="relative">
                      {c.prefixo && (
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 t-sm text-subtle pointer-events-none">
                          {c.prefixo}
                        </span>
                      )}
                      <input
                        type="number"
                        step={c.decimal ? '0.01' : '1'}
                        min="0"
                        value={form[c.nome] ?? ''}
                        onChange={(e) => setForm({ ...form, [c.nome]: e.target.value })}
                        className={cn(
                          'bp-field w-full t-body tabular-nums',
                          // o prefixo (R$) ocupa a esquerda: o campo recua
                          c.prefixo && 'pl-10'
                        )}
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
                <div>
                  <label className="bp-field-label">Observações</label>
                  <input
                    type="text"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    maxLength={500}
                    className="bp-field w-full t-body"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" variant="primary" disabled={salvando} className="flex-1">
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
                {podeExcluir && porData.has(selecionada) && (
                  <Button type="button" variant="danger" onClick={excluir} disabled={salvando}>
                    Excluir
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => setSelecionada(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
