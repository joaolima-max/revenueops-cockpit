'use client'

import { useState, useEffect, useCallback } from 'react'

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
  cliente: { id: string; nome: string; segmento: string | null; modeloOperacional: string }
}

interface Props { clientes: Cliente[] }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

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
  dataInicio: '', dataFim: '', notas: '',
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

export default function FollowUpClient({ clientes }: Props) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'calendario' | 'lista'>('calendario')
  const [weekOffset, setWeekOffset] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

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
    })
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const payload = {
      clienteId: form.clienteId, titulo: form.titulo, descricao: form.descricao,
      tipo: form.tipo, recorrente: form.recorrente,
      diaSemana: form.recorrente ? form.diaSemana : null,
      horaInicio: form.horaInicio || null, horaFim: form.horaFim || null,
      dataInicio: !form.recorrente && form.dataInicio ? form.dataInicio : null,
      dataFim: !form.recorrente && form.dataFim ? form.dataFim : null,
      notas: form.notas || null,
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
  const now = new Date()
  const upcoming = followUps
    .filter(fu => !fu.recorrente && fu.dataInicio && new Date(fu.dataInicio) >= now)
    .sort((a, b) => new Date(a.dataInicio!).getTime() - new Date(b.dataInicio!).getTime())
    .slice(0, 10)

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
        {(['calendario', 'lista'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
            {t === 'calendario' ? 'Calendário Semanal' : 'Todos os Eventos'}
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
                    {fu.recorrente ? DIAS_FULL[fu.diaSemana ?? 0] : fu.dataInicio ? new Date(fu.dataInicio).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {fu.horaInicio ? `${fu.horaInicio}${fu.horaFim ? `–${fu.horaFim}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {fu.recorrente
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Tipo</label>
                  <select value={form.tipo} onChange={f('tipo')} className={inp}>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.recorrente}
                      onChange={e => setForm(p => ({ ...p, recorrente: e.target.checked }))}
                      className="w-4 h-4 rounded accent-emerald-500" />
                    <span className="text-sm text-gray-300">Recorrente (semanal)</span>
                  </label>
                </div>
              </div>

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
