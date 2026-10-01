'use client'

import { useState, useMemo } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { figuraContagem } from '@/lib/format-financeiro'
import { formatDate, TAREFA_STATUS_LABELS, TAREFA_PRIORIDADE_LABELS } from '@/lib/utils'

type Status = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'

interface Tarefa {
  id: string
  titulo: string
  descricao?: string | null
  status: Status
  prioridade: Prioridade
  dueDate?: string | null
  cliente?: { id: string; nome: string } | null
  responsavel: { id: string; name: string }
  criadoPor: { id: string; name: string }
  createdAt: string
}

interface User { id: string; name: string }
interface Cliente { id: string; nome: string }

const PRIORIDADES: Prioridade[] = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']

/** Cor comunica ESTADO. Prioridade usa a mesma escala de severidade dos incidentes. */
const STATUS_TONE: Record<Status, BadgeTone> = {
  PENDENTE: 'warn', EM_ANDAMENTO: 'accent', CONCLUIDA: 'pos', CANCELADA: 'neutral',
}
const PRIORIDADE_TONE: Record<Prioridade, BadgeTone> = {
  BAIXA: 'neutral', MEDIA: 'warn', ALTA: 'alert', CRITICA: 'neg',
}

/** Chips de recorte, no mesmo padrão de Contas a Pagar e a Receber. */
const FILTROS: Array<{ valor: '' | Status; label: string }> = [
  { valor: '', label: 'Todas' },
  { valor: 'PENDENTE', label: 'Pendentes' },
  { valor: 'EM_ANDAMENTO', label: 'Em andamento' },
  { valor: 'CONCLUIDA', label: 'Concluídas' },
  { valor: 'CANCELADA', label: 'Canceladas' },
]

const FORM_VAZIO = {
  titulo: '', descricao: '', prioridade: 'MEDIA' as Prioridade,
  dueDate: '', clienteId: '', responsavelId: '',
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** "atrasada há 3 dias" / "vence em 2 dias" / "vence hoje". */
function prazoTexto(due: string | null | undefined, concluida: boolean): string | null {
  if (!due) return null
  if (concluida) return null
  const dias = Math.round(
    (Date.parse(due.slice(0, 10)) - Date.parse(hojeISO())) / 86_400_000,
  )
  if (!Number.isFinite(dias)) return null
  if (dias === 0) return 'vence hoje'
  if (dias > 0) return `vence em ${dias} dia${dias === 1 ? '' : 's'}`
  const d = Math.abs(dias)
  return `atrasada há ${d} dia${d === 1 ? '' : 's'}`
}

/**
 * TAREFAS — mesma gramática das telas de Financeiro.
 *
 * Cabeçalho com ação, quatro KPIs em HairlineGrid, chips de situação, painel de
 * filtros e tabela. A REGRA DE NEGÓCIO não mudou: os mesmos status, as mesmas
 * prioridades, as mesmas transições (Iniciar → Concluir) e a mesma API.
 */
export default function TarefasClient({ initial, usuarios, clientes, userId }: {
  initial: Tarefa[]
  usuarios: User[]
  clientes: Cliente[]
  userId: string
}) {
  const [tarefas, setTarefas] = useState(initial)
  const [filtroStatus, setFiltroStatus] = useState<'' | Status>('')
  const [filtroPrio, setFiltroPrio] = useState<'' | Prioridade>('')
  const [filtroResp, setFiltroResp] = useState('')
  const [busca, setBusca] = useState('')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...FORM_VAZIO, responsavelId: userId })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Filtro local: a lista vem inteira do servidor e é pequena, então o
  // resultado aparece enquanto se digita, sem ida ao servidor.
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return tarefas.filter((x) =>
      (!filtroStatus || x.status === filtroStatus) &&
      (!filtroPrio || x.prioridade === filtroPrio) &&
      (!filtroResp || x.responsavel.id === filtroResp) &&
      (!t || x.titulo.toLowerCase().includes(t) || (x.cliente?.nome ?? '').toLowerCase().includes(t)),
    )
  }, [tarefas, filtroStatus, filtroPrio, filtroResp, busca])

  const resumo = useMemo(() => ({
    pendentes: tarefas.filter((t) => t.status === 'PENDENTE').length,
    andamento: tarefas.filter((t) => t.status === 'EM_ANDAMENTO').length,
    concluidas: tarefas.filter((t) => t.status === 'CONCLUIDA').length,
    atrasadas: tarefas.filter((t) =>
      t.dueDate && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA'
      && t.dueDate.slice(0, 10) < hojeISO()).length,
  }), [tarefas])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo || !form.responsavelId) return
    setSalvando(true); setErro('')
    const res = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const { tarefa } = await res.json()
      setTarefas((p) => [tarefa, ...p])
      setModal(false)
      setForm({ ...FORM_VAZIO, responsavelId: userId })
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível criar a tarefa.')
    }
    setSalvando(false)
  }

  async function mudarStatus(id: string, status: Status) {
    setErro('')
    const res = await fetch(`/api/tarefas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const { tarefa } = await res.json()
      setTarefas((p) => p.map((t) => (t.id === id ? { ...t, ...tarefa } : t)))
      return
    }
    const d = await res.json().catch(() => ({}))
    setErro(d.error ?? 'Não foi possível atualizar a tarefa.')
  }

  async function excluir(t: Tarefa) {
    if (!confirm(`Excluir a tarefa "${t.titulo}"?`)) return
    const res = await fetch(`/api/tarefas/${t.id}`, { method: 'DELETE' })
    if (res.ok) { setTarefas((p) => p.filter((x) => x.id !== t.id)); return }
    const d = await res.json().catch(() => ({}))
    setErro(d.error ?? 'Não foi possível excluir.')
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'
  const semFiltro = !filtroStatus && !filtroPrio && !filtroResp && !busca

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tarefas"
        sub="Atividades do time, com responsável, prioridade e prazo."
        actions={<Button variant="primary" onClick={() => { setErro(''); setModal(true) }}>+ Nova tarefa</Button>}
      />

      <HairlineGrid cols={4}>
        <StatTile label="Pendentes" figura={figuraContagem(resumo.pendentes)} primary
          note="Ainda não iniciadas" />
        <StatTile label="Em andamento" figura={figuraContagem(resumo.andamento)}
          note="Já iniciadas" />
        <StatTile label="Atrasadas" figura={figuraContagem(resumo.atrasadas)}
          note="Prazo vencido e em aberto" />
        <StatTile label="Concluídas" figura={figuraContagem(resumo.concluidas)}
          note="Encerradas" />
      </HairlineGrid>

      {erro && (
        <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.valor || 'todas'}
            onClick={() => setFiltroStatus(f.valor)}
            aria-pressed={filtroStatus === f.valor}
            className={`px-3 py-1.5 rounded-lg t-label border transition-colors duration-[180ms] ease-bp ${
              filtroStatus === f.valor
                ? 'border-accent/40 bg-accent/10 text-accent-soft'
                : 'border-line text-muted hover:border-line-2 hover:text-fg'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Panel padded={false}>
        <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="search" placeholder="Buscar tarefa ou cliente…" value={busca} className={inp}
            aria-label="Buscar" onChange={(e) => setBusca(e.target.value)} />
          <select value={filtroPrio} className={inp} aria-label="Filtrar por prioridade"
            onChange={(e) => setFiltroPrio(e.target.value as '' | Prioridade)}>
            <option value="">Todas as prioridades</option>
            {PRIORIDADES.map((p) => <option key={p} value={p}>{TAREFA_PRIORIDADE_LABELS[p]}</option>)}
          </select>
          <select value={filtroResp} className={inp} aria-label="Filtrar por responsável"
            onChange={(e) => setFiltroResp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </Panel>

      {visiveis.length === 0 && semFiltro ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhuma tarefa registrada"
            description="Crie a primeira tarefa com responsável, prioridade e prazo."
            action={<Button variant="primary" onClick={() => setModal(true)}>+ Nova tarefa</Button>}
          />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead>
              <HeadRow>
                <Th className="pl-5">Tarefa</Th>
                <Th>Cliente</Th>
                <Th>Responsável</Th>
                <Th>Prazo</Th>
                <Th align="center">Prioridade</Th>
                <Th align="center">Status</Th>
                <Th align="right">Ações</Th>
              </HeadRow>
            </THead>
            <tbody>
              {visiveis.length === 0 ? (
                <EmptyRow colSpan={7}>Nenhuma tarefa com esses filtros.</EmptyRow>
              ) : visiveis.map((t) => {
                const encerrada = t.status === 'CONCLUIDA' || t.status === 'CANCELADA'
                const prazo = prazoTexto(t.dueDate, encerrada)
                const atrasada = !!t.dueDate && !encerrada && t.dueDate.slice(0, 10) < hojeISO()
                return (
                  <Row key={t.id} className={encerrada ? 'opacity-60' : undefined}>
                    <Td className="pl-5">
                      <span className="block t-body font-medium text-fg">{t.titulo}</span>
                      {t.descricao && (
                        <span className="block t-label text-subtle mt-0.5">{t.descricao}</span>
                      )}
                    </Td>
                    <Td className="t-sm text-muted">{t.cliente?.nome ?? '—'}</Td>
                    <Td className="t-sm text-muted">{t.responsavel.name}</Td>
                    <Td className="t-num">
                      <span className="block text-fg">{t.dueDate ? formatDate(t.dueDate) : '—'}</span>
                      {prazo && (
                        <span className={`block t-label ${atrasada ? 'text-neg' : 'text-subtle'}`}>{prazo}</span>
                      )}
                    </Td>
                    <Td align="center">
                      <Badge tone={PRIORIDADE_TONE[t.prioridade]}>
                        {TAREFA_PRIORIDADE_LABELS[t.prioridade]}
                      </Badge>
                    </Td>
                    <Td align="center">
                      <Badge tone={STATUS_TONE[t.status]}>{TAREFA_STATUS_LABELS[t.status]}</Badge>
                    </Td>
                    <Td align="right">
                      <span className="inline-flex gap-2">
                        {t.status === 'PENDENTE' && (
                          <Button size="sm" variant="primary" onClick={() => mudarStatus(t.id, 'EM_ANDAMENTO')}>
                            Iniciar
                          </Button>
                        )}
                        {t.status === 'EM_ANDAMENTO' && (
                          <Button size="sm" variant="primary" onClick={() => mudarStatus(t.id, 'CONCLUIDA')}>
                            Concluir
                          </Button>
                        )}
                        {encerrada && (
                          <Button size="sm" variant="subtle" onClick={() => mudarStatus(t.id, 'PENDENTE')}>
                            Reabrir
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => excluir(t)}>Excluir</Button>
                      </span>
                    </Td>
                  </Row>
                )
              })}
            </tbody>
          </Table>
        </TableShell>
      )}

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Nova tarefa</h2>
              <button onClick={() => setModal(false)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={criar} className="p-5 space-y-4">
              {erro && (
                <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>
              )}

              <div>
                <label className={lbl} htmlFor="tf-titulo">Título *</label>
                <input id="tf-titulo" required value={form.titulo} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
              </div>

              <div>
                <label className={lbl} htmlFor="tf-desc">Descrição</label>
                <textarea id="tf-desc" rows={2} maxLength={1000} value={form.descricao}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="tf-prio">Prioridade *</label>
                  <select id="tf-prio" value={form.prioridade} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, prioridade: e.target.value as Prioridade }))}>
                    {PRIORIDADES.map((p) => (
                      <option key={p} value={p}>{TAREFA_PRIORIDADE_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="tf-prazo">Prazo</label>
                  <input id="tf-prazo" type="date" value={form.dueDate} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="tf-resp">Responsável *</label>
                  <select id="tf-resp" required value={form.responsavelId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, responsavelId: e.target.value }))}>
                    <option value="">Selecione…</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="tf-cliente">Cliente</label>
                  <select id="tf-cliente" value={form.clienteId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, clienteId: e.target.value }))}>
                    <option value="">Nenhum</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando || !form.titulo || !form.responsavelId}>
                  {salvando ? 'Salvando…' : 'Criar tarefa'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
