'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { paleta, gridProps, axisProps, legendProps, cursorBarra, BAR } from '@/lib/chart-theme'
import { useTheme } from '@/components/theme/ThemeProvider'

interface Cliente { id: string; nome: string; segmento: string | null; modeloOperacional: string }

interface FollowUp {
  id: string
  titulo: string
  descricao: string | null
  tipo: string
  recorrente: boolean
  diaSemana: number | null
  horaInicio: string | null
  horaFim: string | null
  dataInicio: string | null
  dataFim: string | null
  notas: string | null
  frequenciaDias: number | null
  ultimoContato: string | null
  proximoContato: string | null
  cliente: { id: string; nome: string; segmento: string | null; modeloOperacional: string }
}

interface Props { clientes: Cliente[] }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const WEEK_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const TIPO_LABELS: Record<string, string> = {
  PICO_OPERACIONAL: 'Pico Operacional',
  REUNIAO: 'Reunião',
  MONITORAMENTO: 'Monitoramento',
  FOLLOW_UP: 'Follow-up',
  ALERTA: 'Alerta',
  OUTRO: 'Outro',
}

const TIPO_COLORS: Record<string, string> = {
  PICO_OPERACIONAL: 'bg-warn/15 text-warn border border-warn/20',
  REUNIAO: 'bg-accent/15 text-accent-soft border border-accent/20',
  MONITORAMENTO: 'bg-accent/15 text-accent-soft border border-accent/20',
  FOLLOW_UP: 'bg-pos/15 text-pos border border-pos/20',
  ALERTA: 'bg-neg/15 text-neg border border-neg/20',
  OUTRO: 'bg-[var(--bp-hover)] text-muted border border-line-2',
}

const TIPO_BG: Record<string, string> = {
  PICO_OPERACIONAL: 'bg-warn/10 border-l-2 border-warn',
  REUNIAO: 'bg-accent/10 border-l-2 border-accent',
  MONITORAMENTO: 'bg-accent/10 border-l-2 border-accent',
  FOLLOW_UP: 'bg-pos/10 border-l-2 border-pos',
  ALERTA: 'bg-neg/10 border-l-2 border-neg',
  OUTRO: 'bg-surface-2 border-l-2 border-line-2',
}

const emptyForm = {
  clienteId: '', titulo: '', descricao: '', tipo: 'FOLLOW_UP',
  recorrente: false, diaSemana: '1', horaInicio: '', horaFim: '',
  dataInicio: '', dataFim: '', notas: '', frequenciaDias: '',
}

const emptyFreqForm = {
  titulo: '', tipo: 'FOLLOW_UP', frequenciaDias: '',
}

function getMondayOfWeek(offset = 0): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7
  const mon = new Date(now)
  mon.setDate(now.getDate() + diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function proximoContatoColor(iso: string | null): string {
  if (!iso) return 'text-subtle'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'text-neg'
  if (diffDays <= 1) return 'text-warn'
  return 'text-pos'
}

function isCarteiraGeral(clienteId: string): boolean {
  return clienteId === 'CARTEIRA_GERAL'
}

function CarteiraGeralBadge() {
  return (
    <span
      className="bg-accent text-on-accent inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
    >
      🗂 Carteira Geral
    </span>
  )
}

// ─── Multi-select dropdown component ──────────────────────────────────────────
interface MultiClientSelectProps {
  clientes: Cliente[]
  selected: string[]
  onChange: (ids: string[]) => void
}

function MultiClientSelect({ clientes, selected, onChange }: MultiClientSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allSelected = clientes.length > 0 && selected.length === clientes.length

  function toggleAll() {
    onChange(allSelected ? [] : clientes.map(c => c.id))
  }

  function toggleOne(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  const label = selected.length === 0
    ? 'Selecione clientes...'
    : selected.length === 1
      ? clientes.find(c => c.id === selected[0])?.nome ?? '1 cliente'
      : `${selected.length} clientes selecionados`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-surface-2 border border-line-2 text-sm rounded-lg px-3 py-2 text-left flex items-center justify-between focus:outline-none focus:border-accent"
      >
        <span className={selected.length === 0 ? 'text-subtle' : 'text-fg'}>{label}</span>
        <svg className={`w-4 h-4 text-subtle transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-surface border border-line-2 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {/* Selecionar todos */}
          <label className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-2 cursor-pointer border-b border-line-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 accent-[var(--color-accent)]"
            />
            <span className="text-xs font-semibold text-pos">Selecionar todos</span>
          </label>

          {clientes.map(c => (
            <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggleOne(c.id)}
                className="w-4 h-4 accent-[var(--color-accent)]"
              />
              <span className="text-sm text-muted truncate">{c.nome}</span>
            </label>
          ))}

          {clientes.length === 0 && (
            <p className="text-xs text-subtle text-center py-4">Nenhum cliente disponível</p>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

export default function FollowUpClient({ clientes }: Props) {
  const { theme } = useTheme()
  const chartPal = paleta(theme)

  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'calendario' | 'frequencia' | 'lista'>('calendario')
  const [weekOffset, setWeekOffset] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  // 'especifico' | 'carteira' — scope toggle for the new event modal
  const [eventoScope, setEventoScope] = useState<'especifico' | 'carteira'>('especifico')
  const [saving, setSaving] = useState(false)

  // Frequency form state
  const [freqForm, setFreqForm] = useState(emptyFreqForm)
  const [freqSelectedClientes, setFreqSelectedClientes] = useState<string[]>([])
  const [savingFreq, setSavingFreq] = useState(false)
  const [freqSaveProgress, setFreqSaveProgress] = useState<{ done: number; total: number } | null>(null)

  const [registrandoId, setRegistrandoId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/followup')
    if (res.ok) { const d = await res.json(); setFollowUps(d.followUps) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const f = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(p => ({ ...p, [field]: e.target.value }))

  const ff = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setFreqForm(p => ({ ...p, [field]: e.target.value }))

  function openNew() {
    setEditingId(null); setForm(emptyForm); setEventoScope('especifico'); setShowModal(true)
  }
  function openEdit(fu: FollowUp) {
    setEditingId(fu.id)
    setEventoScope(isCarteiraGeral(fu.cliente.id) ? 'carteira' : 'especifico')
    setForm({
      clienteId: fu.cliente.id, titulo: fu.titulo, descricao: fu.descricao || '',
      tipo: fu.tipo, recorrente: fu.recorrente,
      diaSemana: fu.diaSemana != null ? String(fu.diaSemana) : '1',
      horaInicio: fu.horaInicio || '', horaFim: fu.horaFim || '',
      dataInicio: fu.dataInicio ? fu.dataInicio.slice(0, 16) : '',
      dataFim: fu.dataFim ? fu.dataFim.slice(0, 16) : '',
      notas: fu.notas || '',
      frequenciaDias: fu.frequenciaDias != null ? String(fu.frequenciaDias) : '',
    })
    setShowModal(true)
  }

  const isFrequencyMode = parseInt(form.frequenciaDias) > 0

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const freqDias = form.frequenciaDias ? parseInt(form.frequenciaDias) : null
    const resolvedClienteId = eventoScope === 'carteira' ? 'CARTEIRA_GERAL' : form.clienteId
    const payload = {
      clienteId: resolvedClienteId, titulo: form.titulo, descricao: form.descricao,
      tipo: form.tipo,
      recorrente: freqDias ? false : form.recorrente,
      diaSemana: (!freqDias && form.recorrente) ? form.diaSemana : null,
      horaInicio: freqDias ? null : (form.horaInicio || null),
      horaFim: freqDias ? null : (form.horaFim || null),
      dataInicio: (!freqDias && !form.recorrente && form.dataInicio) ? form.dataInicio : null,
      dataFim: (!freqDias && !form.recorrente && form.dataFim) ? form.dataFim : null,
      notas: form.notas || null,
      frequenciaDias: freqDias,
    }
    if (editingId) {
      const res = await fetch(`/api/followup/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) { const d = await res.json(); setFollowUps(p => p.map(fu => fu.id === editingId ? d.followUp : fu)) }
    } else {
      const res = await fetch('/api/followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) { const d = await res.json(); setFollowUps(p => [...p, d.followUp]) }
    }
    setShowModal(false); setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este evento?')) return
    const res = await fetch(`/api/followup/${id}`, { method: 'DELETE' })
    if (res.ok) setFollowUps(p => p.filter(fu => fu.id !== id))
  }

  async function registrarContato(id: string, frequenciaDias: number) {
    setRegistrandoId(id)
    const now = new Date()
    const proximo = new Date(now)
    proximo.setDate(proximo.getDate() + frequenciaDias)
    const res = await fetch(`/api/followup/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ultimoContato: now.toISOString(), proximoContato: proximo.toISOString() }),
    })
    if (res.ok) { const d = await res.json(); setFollowUps(p => p.map(fu => fu.id === id ? d.followUp : fu)) }
    setRegistrandoId(null)
  }

  async function handleFreqSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (freqSelectedClientes.length === 0) return
    setSavingFreq(true)
    setFreqSaveProgress({ done: 0, total: freqSelectedClientes.length })

    const newFollowUps: FollowUp[] = []
    for (let i = 0; i < freqSelectedClientes.length; i++) {
      const clienteId = freqSelectedClientes[i]
      const payload = {
        clienteId,
        titulo: freqForm.titulo,
        tipo: freqForm.tipo,
        frequenciaDias: freqForm.frequenciaDias ? parseInt(freqForm.frequenciaDias) : null,
        recorrente: false,
      }
      const res = await fetch('/api/followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) { const d = await res.json(); newFollowUps.push(d.followUp) }
      setFreqSaveProgress({ done: i + 1, total: freqSelectedClientes.length })
    }

    if (newFollowUps.length > 0) {
      setFollowUps(p => [...p, ...newFollowUps])
    }
    setFreqForm(emptyFreqForm)
    setFreqSelectedClientes([])
    setFreqSaveProgress(null)
    setSavingFreq(false)
  }

  // Build weekly calendar: Mon–Sun
  const monday = getMondayOfWeek(weekOffset)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d
  })
  // weekDays[0]=Mon(1), [1]=Tue(2), ..., [6]=Sun(0)
  const weekDayNums = [1, 2, 3, 4, 5, 6, 0]

  function getEventsForDay(dayNum: number, dayDate: Date): FollowUp[] {
    return followUps.filter(fu => {
      if (fu.recorrente) return fu.diaSemana === dayNum
      if (fu.dataInicio) {
        const d = new Date(fu.dataInicio)
        return d.getFullYear() === dayDate.getFullYear() &&
          d.getMonth() === dayDate.getMonth() &&
          d.getDate() === dayDate.getDate()
      }
      return false
    }).sort((a, b) => (a.horaInicio || '00:00').localeCompare(b.horaInicio || '00:00'))
  }

  // Upcoming one-time events (next 14 days)
  const nowTs = new Date()
  const upcoming = followUps
    .filter(fu => !fu.recorrente && !fu.frequenciaDias && fu.dataInicio && new Date(fu.dataInicio) >= nowTs)
    .sort((a, b) => new Date(a.dataInicio!).getTime() - new Date(b.dataInicio!).getTime())
    .slice(0, 10)

  // Frequency rules: follow-ups with frequenciaDias set
  const freqRules = followUps.filter(fu => fu.frequenciaDias != null && fu.frequenciaDias > 0)

  // Weekly chart data
  const weekChartData = WEEK_LABELS.map((label, i) => {
    const dayNum = weekDayNums[i]
    const dayDate = weekDays[i]
    const recorrentes = followUps.filter(fu =>
      (fu.recorrente && !fu.frequenciaDias) && fu.diaSemana === dayNum
    ).length
    // frequency-rule follow-ups due on this day (proximoContato falls on this day)
    const frequencia = freqRules.filter(fu => {
      if (!fu.proximoContato) return false
      const d = new Date(fu.proximoContato)
      return d.getFullYear() === dayDate.getFullYear() &&
        d.getMonth() === dayDate.getMonth() &&
        d.getDate() === dayDate.getDate()
    }).length
    return { label, Recorrentes: recorrentes, Frequência: frequencia }
  })

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  const todayNum = new Date().getDay()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="t-h1 text-fg">Follow-up & Calendário CRM</h1>
          <p className="text-subtle text-sm mt-0.5">Monitoramento de clientes da carteira por datas e horários</p>
        </div>
        <button onClick={openNew}
          className="bp-btn-primary px-4 py-2 text-sm font-medium rounded-lg">
          + Novo Evento
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        {Object.keys(TIPO_LABELS).map(tipo => {
          const count = followUps.filter(fu => fu.tipo === tipo).length
          if (!count) return null
          return (
            <span key={tipo} className={`text-xs px-2.5 py-1 rounded-full font-medium ${TIPO_COLORS[tipo]}`}>
              {TIPO_LABELS[tipo]}: {count}
            </span>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-line rounded-xl p-1 w-fit">
        {(['calendario', 'frequencia', 'lista'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-surface-2 text-fg' : 'text-subtle hover:text-muted'}`}>
            {t === 'calendario' ? 'Calendário Semanal' : t === 'frequencia' ? 'Frequência de Follow-up' : 'Todos os Eventos'}
          </button>
        ))}
      </div>

      {/* CALENDAR TAB */}
      {tab === 'calendario' && (
        <div className="space-y-5">
          {/* Week navigation */}
          <div className="flex items-center gap-4">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface border border-line text-muted hover:text-fg hover:border-line-2 transition-colors">
              ‹
            </button>
            <span className="text-sm text-muted font-medium">
              {weekOffset === 0 ? 'Semana atual' : weekOffset === 1 ? 'Próxima semana' : weekOffset === -1 ? 'Semana passada' : `${weekOffset > 0 ? '+' : ''}${weekOffset} semanas`}
              {' · '}{fmtDate(weekDays[0])} – {fmtDate(weekDays[6])}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface border border-line text-muted hover:text-fg hover:border-line-2 transition-colors">
              ›
            </button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="text-xs text-accent hover:text-accent-soft">
                Hoje
              </button>
            )}
          </div>

          {/* Week grid — abaixo de ~900px os 7 dias rolam na horizontal em
              vez de espremer cada coluna a uns 40px. */}
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="grid grid-cols-7 gap-2 min-w-[52rem]">
            {weekDays.map((dayDate, i) => {
              const dayNum = weekDayNums[i]
              const events = getEventsForDay(dayNum, dayDate)
              const isToday = weekOffset === 0 && dayNum === todayNum
              return (
                <div key={i} className={`bg-surface border rounded-xl p-3 min-h-[160px] ${isToday ? 'border-pos/40' : 'border-line'}`}>
                  <div className={`text-xs font-semibold mb-2 ${isToday ? 'text-pos' : 'text-subtle'}`}>
                    {DIAS[dayNum]}
                    <span className="block text-subtle font-normal">{fmtDate(dayDate)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {events.map(fu => (
                      <button key={fu.id} onClick={() => openEdit(fu)}
                        className={`w-full text-left rounded-lg px-2 py-1.5 ${TIPO_BG[fu.tipo]} hover:opacity-80 transition-opacity`}>
                        {(fu.horaInicio || fu.dataInicio) && (
                          <p className="text-xs text-muted leading-tight">
                            {fu.horaInicio}{fu.horaFim ? `–${fu.horaFim}` : ''}
                            {!fu.horaInicio && fu.dataInicio && new Date(fu.dataInicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {isCarteiraGeral(fu.cliente.id) ? (
                          <p className="leading-snug">
                            <span
                              className="bg-accent text-on-accent text-xs font-semibold px-1.5 py-0.5 rounded-full"
                            >
                              🗂 Carteira
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs font-medium text-fg leading-snug truncate">{fu.cliente.nome}</p>
                        )}
                        <p className="text-xs text-subtle leading-tight truncate">{fu.titulo}</p>
                      </button>
                    ))}
                    {events.length === 0 && (
                      <p className="t-sm text-subtle text-center pt-4">—</p>
                    )}
                  </div>
                </div>
              )
            })}
            </div>
          </div>

          {/* Upcoming one-time events */}
          {upcoming.length > 0 && (
            <div className="bg-surface border border-line rounded-xl p-5">
              <h3 className="t-h3 text-fg mb-4">Próximos Eventos (agenda)</h3>
              <div className="space-y-2">
                {upcoming.map(fu => {
                  const d = new Date(fu.dataInicio!)
                  return (
                    <div key={fu.id} className={`flex items-center gap-4 rounded-lg px-3 py-2.5 ${TIPO_BG[fu.tipo]}`}>
                      <div className="w-14 text-center flex-shrink-0">
                        <p className="text-xs font-bold text-fg">{DIAS[d.getDay()]}</p>
                        <p className="text-xs text-subtle">{fmtDate(d)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{fu.titulo}</p>
                        {isCarteiraGeral(fu.cliente.id) ? (
                          <CarteiraGeralBadge />
                        ) : (
                          <p className="text-xs text-subtle truncate">{fu.cliente.nome}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {fu.horaInicio && <p className="text-xs text-muted">{fu.horaInicio}{fu.horaFim ? `–${fu.horaFim}` : ''}</p>}
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIPO_COLORS[fu.tipo]}`}>{TIPO_LABELS[fu.tipo]}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FREQUENCY TAB */}
      {tab === 'frequencia' && (
        <div className="space-y-6">
          {/* Chart: Agenda de Follow-ups da Semana */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="t-h3 text-fg mb-4">Agenda de Follow-ups da Semana</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weekChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...gridProps(chartPal)} />
                <XAxis dataKey="label" {...axisProps(chartPal)} />
                <YAxis allowDecimals={false} {...axisProps(chartPal)} />
                <Tooltip
                  cursor={cursorBarra(chartPal)}
                  contentStyle={{
                    background: chartPal.tipBg, border: `1px solid ${chartPal.tipBorder}`,
                    borderRadius: 12, fontSize: 12,
                  }}
                  labelStyle={{ color: chartPal.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em' }}
                  itemStyle={{ color: chartPal.fg }}
                />
                <Legend {...legendProps(chartPal)} />
                <Bar dataKey="Recorrentes" stackId="a" fill={chartPal.s1} maxBarSize={BAR.maxBarSize} />
                <Bar dataKey="Frequência" stackId="a" fill={chartPal.s2} radius={[3, 3, 0, 0]} maxBarSize={BAR.maxBarSize} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Section A: Regras de Frequência */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="t-h3 text-fg mb-4">Regras de Frequência</h3>
            {loading ? (
              <p className="text-subtle text-sm py-6 text-center">Carregando...</p>
            ) : freqRules.length === 0 ? (
              <p className="text-subtle text-sm py-6 text-center">Nenhuma regra de frequência cadastrada</p>
            ) : (
              <div className="space-y-3">
                {freqRules.map(fu => {
                  const pcColor = proximoContatoColor(fu.proximoContato)
                  return (
                    <div key={fu.id} className="bg-surface-2 border border-line-2 rounded-xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isCarteiraGeral(fu.cliente.id) ? (
                            <CarteiraGeralBadge />
                          ) : (
                            <span className="text-sm font-medium text-fg truncate">{fu.cliente.nome}</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[fu.tipo]}`}>
                            {TIPO_LABELS[fu.tipo]}
                          </span>
                        </div>
                        <p className="text-xs text-muted truncate">{fu.titulo}</p>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <span className="text-pos font-medium">A cada {fu.frequenciaDias} dias</span>
                          <span className="text-subtle">
                            Último contato: {fu.ultimoContato ? fmtDateFull(fu.ultimoContato) : '—'}
                          </span>
                          <span className={`font-medium ${pcColor}`}>
                            Próximo follow-up: {fu.proximoContato ? fmtDateFull(fu.proximoContato) : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => registrarContato(fu.id, fu.frequenciaDias!)}
                          disabled={registrandoId === fu.id}
                          className="bp-btn-primary text-xs px-3 py-1.5 rounded-lg font-medium">
                          {registrandoId === fu.id ? 'Registrando...' : 'Registrar Contato'}
                        </button>
                        <button onClick={() => openEdit(fu)}
                          className="text-xs px-2 py-1.5 bg-surface-2 text-muted rounded-lg hover:bg-line-2">
                          Editar
                        </button>
                        <button onClick={() => handleDelete(fu.id)}
                          className="text-xs px-2 py-1.5 bg-neg/10 text-neg rounded-lg hover:bg-neg/20">
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section B: Adicionar Regra de Frequência */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="t-h3 text-fg mb-4">Adicionar Regra de Frequência</h3>
            <form onSubmit={handleFreqSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className={lbl}>Clientes * ({freqSelectedClientes.length} selecionados)</label>
                <MultiClientSelect
                  clientes={clientes}
                  selected={freqSelectedClientes}
                  onChange={setFreqSelectedClientes}
                />
              </div>
              <div className="sm:col-span-1">
                <label className={lbl}>Título *</label>
                <input required type="text" value={freqForm.titulo} onChange={ff('titulo')} className={inp}
                  placeholder="Ex: Follow-up BaaS a cada 2 dias" />
              </div>
              <div>
                <label className={lbl}>Tipo</label>
                <select value={freqForm.tipo} onChange={ff('tipo')} className={inp}>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Repetir a cada (dias) *</label>
                <input required type="number" min="1" value={freqForm.frequenciaDias} onChange={ff('frequenciaDias')} className={inp}
                  placeholder="Ex: 7" />
              </div>
              <div className="col-span-2 sm:col-span-4 flex items-center justify-between gap-4">
                {freqSaveProgress && (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-1 bg-surface-2 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-accent transition-all duration-300"
                        style={{
                          width: `${Math.round((freqSaveProgress.done / freqSaveProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted whitespace-nowrap">
                      {freqSaveProgress.done}/{freqSaveProgress.total} clientes
                    </span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={savingFreq || freqSelectedClientes.length === 0}
                  className="bp-btn-primary ml-auto px-5 py-2 rounded-lg text-sm font-medium">
                  {savingFreq
                    ? `Salvando ${freqSaveProgress?.done ?? 0}/${freqSaveProgress?.total ?? freqSelectedClientes.length}...`
                    : freqSelectedClientes.length > 1
                      ? `+ Adicionar para ${freqSelectedClientes.length} clientes`
                      : '+ Adicionar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIST TAB */}
      {tab === 'lista' && (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line">
                {['Cliente', 'Título', 'Tipo', 'Quando', 'Horário', 'Recorrente', 'Ações'].map(h => (
                  <th key={h} className={`t-label text-subtle px-4 py-3 ${h === 'Ações' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center text-subtle py-12 text-sm">Carregando...</td></tr>
              ) : followUps.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-subtle py-12 text-sm">Nenhum evento cadastrado</td></tr>
              ) : followUps.map(fu => (
                <tr key={fu.id} className="border-b border-line hover:bg-[var(--bp-hover)]">
                  <td className="px-4 py-3">
                    {isCarteiraGeral(fu.cliente.id)
                      ? <CarteiraGeralBadge />
                      : <span className="text-fg font-medium">{fu.cliente.nome}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-muted">{fu.titulo}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[fu.tipo]}`}>
                      {TIPO_LABELS[fu.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {fu.frequenciaDias
                      ? `A cada ${fu.frequenciaDias}d`
                      : fu.recorrente
                        ? DIAS_FULL[fu.diaSemana ?? 0]
                        : fu.dataInicio ? fmtDateFull(fu.dataInicio) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {fu.horaInicio ? `${fu.horaInicio}${fu.horaFim ? `–${fu.horaFim}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {fu.frequenciaDias
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-warn/10 text-warn">Frequência</span>
                      : fu.recorrente
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-soft">Semanal</span>
                        : <span className="text-xs text-subtle">Único</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(fu)} className="text-xs px-2 py-1 bg-surface-2 text-muted rounded hover:bg-surface-2">Editar</button>
                      <button onClick={() => handleDelete(fu.id)} className="text-xs px-2 py-1 bg-neg/10 text-neg rounded hover:bg-neg/20">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">{editingId ? 'Editar Evento' : 'Novo Evento'}</h2>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-fg">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* Scope toggle + client select (new events only) */}
              {!editingId && (
                <div className="space-y-2">
                  {/* Toggle pills */}
                  <div className="flex gap-1 p-1 bg-surface-2 rounded-lg w-fit">
                    <button
                      type="button"
                      onClick={() => setEventoScope('especifico')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${eventoScope === 'especifico' ? 'bg-accent text-on-accent' : 'text-subtle hover:text-muted'}`}
                    >
                      Específico ▾
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventoScope('carteira')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        eventoScope === 'carteira'
                          ? 'bg-accent text-on-accent'
                          : 'text-subtle hover:text-muted'
                      }`}
                    >
                      Toda a Carteira
                    </button>
                  </div>

                  {/* Client select — only when "específico" */}
                  {eventoScope === 'especifico' && (
                    <div>
                      <label className={lbl}>Cliente *</label>
                      <select required value={form.clienteId} onChange={f('clienteId')} className={inp}>
                        <option value="">Selecione...</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                  )}

                  {eventoScope === 'carteira' && (
                    <p className="text-xs text-pos">
                      Este evento será vinculado à carteira inteira (todos os clientes).
                    </p>
                  )}
                </div>
              )}

              {/* When editing a carteira event, show a read-only badge */}
              {editingId && eventoScope === 'carteira' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-subtle">Escopo:</span>
                  <CarteiraGeralBadge />
                </div>
              )}

              <div>
                <label className={lbl}>Título *</label>
                <input required type="text" value={form.titulo} onChange={f('titulo')} className={inp}
                  placeholder="Ex: Horário de pico operacional" />
              </div>
              <div className={`grid gap-4 ${isFrequencyMode ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className={lbl}>Tipo</label>
                  <select value={form.tipo} onChange={f('tipo')} className={inp}>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {!isFrequencyMode && (
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.recorrente}
                        onChange={e => setForm(p => ({ ...p, recorrente: e.target.checked }))}
                        className="w-4 h-4 accent-[var(--color-accent)]" />
                      <span className="text-sm text-muted">Recorrente (semanal)</span>
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className={lbl}>Frequência de contato (dias)</label>
                <input type="number" min="0" value={form.frequenciaDias} onChange={f('frequenciaDias')} className={inp}
                  placeholder="Ex: 7 — preencha para criar uma regra de frequência" />
                {isFrequencyMode && (
                  <p className="text-xs text-warn mt-1">Modo frequência ativo — campos de data/hora ocultos.</p>
                )}
              </div>

              {!isFrequencyMode && (
                <>
                  {form.recorrente ? (
                    <div>
                      <label className={lbl}>Dia da Semana</label>
                      <select value={form.diaSemana} onChange={f('diaSemana')} className={inp}>
                        {DIAS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={lbl}>Data/Hora Início</label>
                        <input type="datetime-local" value={form.dataInicio} onChange={f('dataInicio')} className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>Data/Hora Fim (opcional)</label>
                        <input type="datetime-local" value={form.dataFim} onChange={f('dataFim')} className={inp} />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>Horário Início</label>
                      <input type="time" value={form.horaInicio} onChange={f('horaInicio')} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Horário Fim</label>
                      <input type="time" value={form.horaFim} onChange={f('horaFim')} className={inp} />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className={lbl}>Descrição</label>
                <textarea rows={2} value={form.descricao} onChange={f('descricao')} className={inp + ' resize-none'}
                  placeholder="Detalhes sobre o evento..." />
              </div>
              <div>
                <label className={lbl}>Notas</label>
                <textarea rows={2} value={form.notas} onChange={f('notas')} className={inp + ' resize-none'} />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2 rounded-lg text-sm text-muted border border-line-2 hover:bg-surface-2">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="bp-btn-primary flex-1 py-2 rounded-lg text-sm font-medium">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
