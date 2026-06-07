'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

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
  PICO_OPERACIONAL: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  REUNIAO: 'bg-sky-500/15 text-sky-400 border border-sky-500/20',
  MONITORAMENTO: 'bg-violet-500/15 text-violet-400 border border-violet-500/20',
  FOLLOW_UP: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  ALERTA: 'bg-red-500/15 text-red-400 border border-red-500/20',
  OUTRO: 'bg-gray-500/15 text-gray-400 border border-gray-700',
}

const TIPO_BG: Record<string, string> = {
  PICO_OPERACIONAL: 'bg-amber-500/10 border-l-2 border-amber-500',
  REUNIAO: 'bg-sky-500/10 border-l-2 border-sky-500',
  MONITORAMENTO: 'bg-violet-500/10 border-l-2 border-violet-500',
  FOLLOW_UP: 'bg-emerald-500/10 border-l-2 border-emerald-500',
  ALERTA: 'bg-red-500/10 border-l-2 border-red-500',
  OUTRO: 'bg-gray-800 border-l-2 border-gray-600',
}

const emptyForm = {
  clienteId: '', titulo: '', descricao: '', tipo: 'FOLLOW_UP',
  recorrente: false, diaSemana: '1', horaInicio: '', horaFim: '',
  dataInicio: '', dataFim: '', notas: '', frequenciaDias: '',
}

const emptyFreqForm = {
  clienteId: '', titulo: '', tipo: 'FOLLOW_UP', frequenciaDias: '',
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
  if (!iso) return 'text-gray-500'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'text-red-400'
  if (diffDays <= 1) return 'text-amber-400'
  return 'text-emerald-400'
}

export default function FollowUpClient({ clientes }: Props) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'calendario' | 'frequencia' | 'lista'>('calendario')
  const [weekOffset, setWeekOffset] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [freqForm, setFreqForm] = useState(emptyFreqForm)
  const [savingFreq, setSavingFreq] = useState(false)
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
    setEditingId(null); setForm(emptyForm); setShowModal(true)
  }
  function openEdit(fu: FollowUp) {
    setEditingId(fu.id)
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
    const payload = {
      clienteId: form.clienteId, titulo: form.titulo, descricao: form.descricao,
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
    e.preventDefault(); setSavingFreq(true)
    const payload = {
      clienteId: freqForm.clienteId,
      titulo: freqForm.titulo,
      tipo: freqForm.tipo,
      frequenciaDias: freqForm.frequenciaDias ? parseInt(freqForm.frequenciaDias) : null,
      recorrente: false,
    }
    const res = await fetch('/api/followup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) { const d = await res.json(); setFollowUps(p => [...p, d.followUp]); setFreqForm(emptyFreqForm) }
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

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  const todayNum = new Date().getDay()

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Follow-up & Calendário CRM</h1>
          <p className="text-gray-600 text-sm mt-0.5">Monitoramento de clientes da carteira por datas e horários</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
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
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['calendario', 'frequencia', 'lista'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
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
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition-colors">
              ‹
            </button>
            <span className="text-sm text-gray-300 font-medium">
              {weekOffset === 0 ? 'Semana atual' : weekOffset === 1 ? 'Próxima semana' : weekOffset === -1 ? 'Semana passada' : `${weekOffset > 0 ? '+' : ''}${weekOffset} semanas`}
              {' · '}{fmtDate(weekDays[0])} – {fmtDate(weekDays[6])}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition-colors">
              ›
            </button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="text-xs text-emerald-500 hover:text-emerald-400">
                Hoje
              </button>
            )}
          </div>

          {/* Week grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((dayDate, i) => {
              const dayNum = weekDayNums[i]
              const events = getEventsForDay(dayNum, dayDate)
              const isToday = weekOffset === 0 && dayNum === todayNum
              return (
                <div key={i} className={`bg-gray-900 border rounded-xl p-3 min-h-[160px] ${isToday ? 'border-emerald-500/40' : 'border-gray-800'}`}>
                  <div className={`text-xs font-semibold mb-2 ${isToday ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {DIAS[dayNum]}
                    <span className="block text-gray-700 font-normal">{fmtDate(dayDate)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {events.map(fu => (
                      <button key={fu.id} onClick={() => openEdit(fu)}
                        className={`w-full text-left rounded-lg px-2 py-1.5 ${TIPO_BG[fu.tipo]} hover:opacity-80 transition-opacity`}>
                        {(fu.horaInicio || fu.dataInicio) && (
                          <p className="text-xs text-gray-400 leading-tight">
                            {fu.horaInicio}{fu.horaFim ? `–${fu.horaFim}` : ''}
                            {!fu.horaInicio && fu.dataInicio && new Date(fu.dataInicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        <p className="text-xs font-medium text-white leading-snug truncate">{fu.cliente.nome}</p>
                        <p className="text-xs text-gray-500 leading-tight truncate">{fu.titulo}</p>
                      </button>
                    ))}
                    {events.length === 0 && (
                      <p className="text-xs text-gray-800 text-center pt-4">—</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Upcoming one-time events */}
          {upcoming.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Próximos Eventos (agenda)</h3>
              <div className="space-y-2">
                {upcoming.map(fu => {
                  const d = new Date(fu.dataInicio!)
                  return (
                    <div key={fu.id} className={`flex items-center gap-4 rounded-lg px-3 py-2.5 ${TIPO_BG[fu.tipo]}`}>
                      <div className="w-14 text-center flex-shrink-0">
                        <p className="text-xs font-bold text-white">{DIAS[d.getDay()]}</p>
                        <p className="text-xs text-gray-500">{fmtDate(d)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{fu.titulo}</p>
                        <p className="text-xs text-gray-500 truncate">{fu.cliente.nome}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {fu.horaInicio && <p className="text-xs text-gray-400">{fu.horaInicio}{fu.horaFim ? `–${fu.horaFim}` : ''}</p>}
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Agenda de Follow-ups da Semana</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weekChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#e5e7eb' }}
                  itemStyle={{ color: '#9ca3af' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                <Bar dataKey="Recorrentes" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Frequência" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Section A: Regras de Frequência */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Regras de Frequência</h3>
            {loading ? (
              <p className="text-gray-700 text-sm py-6 text-center">Carregando...</p>
            ) : freqRules.length === 0 ? (
              <p className="text-gray-700 text-sm py-6 text-center">Nenhuma regra de frequência cadastrada</p>
            ) : (
              <div className="space-y-3">
                {freqRules.map(fu => {
                  const pcColor = proximoContatoColor(fu.proximoContato)
                  return (
                    <div key={fu.id} className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white truncate">{fu.cliente.nome}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[fu.tipo]}`}>
                            {TIPO_LABELS[fu.tipo]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate">{fu.titulo}</p>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <span className="text-emerald-400 font-medium">A cada {fu.frequenciaDias} dias</span>
                          <span className="text-gray-500">
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
                          className="text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                          {registrandoId === fu.id ? 'Registrando...' : 'Registrar Contato'}
                        </button>
                        <button onClick={() => openEdit(fu)}
                          className="text-xs px-2 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600">
                          Editar
                        </button>
                        <button onClick={() => handleDelete(fu.id)}
                          className="text-xs px-2 py-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20">
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Adicionar Regra de Frequência</h3>
            <form onSubmit={handleFreqSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className={lbl}>Cliente *</label>
                <select required value={freqForm.clienteId} onChange={ff('clienteId')} className={inp}>
                  <option value="">Selecione...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
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
              <div className="col-span-2 sm:col-span-4 flex justify-end">
                <button type="submit" disabled={savingFreq}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  {savingFreq ? 'Salvando...' : '+ Adicionar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIST TAB */}
      {tab === 'lista' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Cliente', 'Título', 'Tipo', 'Quando', 'Horário', 'Recorrente', 'Ações'].map(h => (
                  <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-3 ${h === 'Ações' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center text-gray-700 py-12 text-sm">Carregando...</td></tr>
              ) : followUps.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-700 py-12 text-sm">Nenhum evento cadastrado</td></tr>
              ) : followUps.map(fu => (
                <tr key={fu.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-4 py-3 text-white font-medium">{fu.cliente.nome}</td>
                  <td className="px-4 py-3 text-gray-300">{fu.titulo}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[fu.tipo]}`}>
                      {TIPO_LABELS[fu.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {fu.frequenciaDias
                      ? `A cada ${fu.frequenciaDias}d`
                      : fu.recorrente
                        ? DIAS_FULL[fu.diaSemana ?? 0]
                        : fu.dataInicio ? new Date(fu.dataInicio).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {fu.horaInicio ? `${fu.horaInicio}${fu.horaFim ? `–${fu.horaFim}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {fu.frequenciaDias
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Frequência</span>
                      : fu.recorrente
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">Semanal</span>
                        : <span className="text-xs text-gray-700">Único</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(fu)} className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700">Editar</button>
                      <button onClick={() => handleDelete(fu.id)} className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">{editingId ? 'Editar Evento' : 'Novo Evento'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {!editingId && (
                <div>
                  <label className={lbl}>Cliente *</label>
                  <select required value={form.clienteId} onChange={f('clienteId')} className={inp}>
                    <option value="">Selecione...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
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
                        className="w-4 h-4 rounded accent-emerald-500" />
                      <span className="text-sm text-gray-300">Recorrente (semanal)</span>
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className={lbl}>Frequência de contato (dias)</label>
                <input type="number" min="0" value={form.frequenciaDias} onChange={f('frequenciaDias')} className={inp}
                  placeholder="Ex: 7 — preencha para criar uma regra de frequência" />
                {isFrequencyMode && (
                  <p className="text-xs text-amber-400 mt-1">Modo frequência ativo — campos de data/hora ocultos.</p>
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
                    <div className="grid grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-2 gap-4">
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
                  className="flex-1 py-2 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
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
