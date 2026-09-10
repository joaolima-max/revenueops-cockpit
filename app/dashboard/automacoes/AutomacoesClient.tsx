'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td } from '@/components/ui/DataTable'
import {
  AUTOMACAO_GATILHO_LABELS, AUTOMACAO_ACAO_LABELS, ROLE_LABELS, formatDateTime,
} from '@/lib/utils'
import {
  GATILHOS, ACOES, OPERADORES, OPERADOR_LABELS,
  CAMPOS_CONDICAO, CAMPO_CONDICAO_LABELS,
  type Gatilho, type Acao, type Regra,
} from '@/lib/automacoes'

interface Automacao {
  id: string
  nome: string
  ativo: boolean
  gatilho: Gatilho
  acao: Acao
  funilId: string | null
  etapaId: string | null
  funilDestinoId: string | null
  etapaDestinoId: string | null
  destinatarioRole: string | null
  destinatarioUserId: string | null
  titulo: string | null
  mensagem: string | null
  condicao: { todas?: Regra[] } | null
  funil: { nome: string } | null
  etapa: { nome: string } | null
  funilDestino: { nome: string } | null
  etapaDestino: { nome: string } | null
  destinatario: { name: string } | null
  _count: { execucoes: number }
}

interface Funil { id: string; nome: string; etapas: Array<{ id: string; nome: string }> }
interface Usuario { id: string; name: string; role: string }

interface Execucao {
  id: string; status: string; resultado: string | null; erro: string | null; createdAt: string
}

const ROLES = ['ADMIN', 'GESTOR', 'OPERACIONAL', 'COMERCIAL']

const FORM_VAZIO = {
  nome: '', gatilho: 'ETAPA_CONCLUIDA' as Gatilho, funilId: '', etapaId: '',
  acao: 'NOTIFICAR' as Acao, funilDestinoId: '', etapaDestinoId: '',
  destinatarioRole: '', destinatarioUserId: '', titulo: '', mensagem: '',
  regras: [] as Regra[],
}

export default function AutomacoesClient() {
  const [automacoes, setAutomacoes] = useState<Automacao[]>([])
  const [funis, setFunis] = useState<Funil[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)

  const [modal, setModal] = useState<'nova' | Automacao | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [execucoes, setExecucoes] = useState<{ nome: string; itens: Execucao[] } | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/automacoes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setAutomacoes(d.automacoes ?? [])
        setFunis(d.funis ?? [])
        setUsuarios(d.usuarios ?? [])
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [versao])

  function abrirNova() { setForm(FORM_VAZIO); setErro(''); setModal('nova') }

  function abrirEdicao(a: Automacao) {
    setForm({
      nome: a.nome, gatilho: a.gatilho, funilId: a.funilId ?? '', etapaId: a.etapaId ?? '',
      acao: a.acao, funilDestinoId: a.funilDestinoId ?? '', etapaDestinoId: a.etapaDestinoId ?? '',
      destinatarioRole: a.destinatarioRole ?? '', destinatarioUserId: a.destinatarioUserId ?? '',
      titulo: a.titulo ?? '', mensagem: a.mensagem ?? '',
      regras: a.condicao?.todas ?? [],
    })
    setErro(''); setModal(a)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro('')

    const corpo = {
      ...form,
      funilId: form.funilId || null,
      etapaId: form.etapaId || null,
      funilDestinoId: form.funilDestinoId || null,
      etapaDestinoId: form.etapaDestinoId || null,
      destinatarioRole: form.destinatarioRole || null,
      destinatarioUserId: form.destinatarioUserId || null,
      condicao: form.regras.length > 0 ? { todas: form.regras } : null,
    }

    const editando = modal !== 'nova' && modal !== null
    const res = await fetch(editando ? `/api/automacoes/${modal.id}` : '/api/automacoes', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar.'); setSalvando(false); return
    }
    setModal(null); setSalvando(false); setVersao((v) => v + 1)
  }

  async function alternarAtivo(a: Automacao) {
    await fetch(`/api/automacoes/${a.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !a.ativo }),
    })
    setVersao((v) => v + 1)
  }

  async function verExecucoes(a: Automacao) {
    const res = await fetch(`/api/automacoes/${a.id}`)
    if (!res.ok) return
    const d = await res.json()
    setExecucoes({ nome: a.nome, itens: d.automacao.execucoes ?? [] })
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  const etapasDoGatilho = funis.find((f) => f.id === form.funilId)?.etapas ?? []
  const etapasDoDestino = funis.find((f) => f.id === form.funilDestinoId)?.etapas ?? []
  const precisaDestinatario = form.acao !== 'TRANSFERIR_FUNIL'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Automações"
        sub="Quando algo acontece no pipeline, o sistema age. Sem código: escolha o gatilho, a condição e a ação."
        actions={<Button variant="primary" onClick={abrirNova}>+ Nova automação</Button>}
      />

      {carregando ? (
        <p className="t-sm text-subtle">Carregando...</p>
      ) : automacoes.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhuma automação"
            description="Exemplo: quando a etapa Fechamento for concluída no funil de Vendas, transferir para Onboarding / Kickoff e notificar o responsável."
            action={<Button variant="primary" onClick={abrirNova}>+ Nova automação</Button>}
          />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead><HeadRow>
              <Th>Automação</Th><Th>Quando</Th><Th>Então</Th>
              <Th align="right">Execuções</Th><Th align="center">Status</Th><Th align="right">Ações</Th>
            </HeadRow></THead>
            <tbody>
              {automacoes.map((a) => (
                <Row key={a.id} className={a.ativo ? undefined : 'opacity-60'}>
                  <Td className="text-fg font-medium">{a.nome}</Td>
                  <Td className="t-sm">
                    {AUTOMACAO_GATILHO_LABELS[a.gatilho]}
                    <p className="t-label text-subtle mt-0.5">
                      {a.funil?.nome ?? 'qualquer funil'}{a.etapa ? ` · ${a.etapa.nome}` : ''}
                      {a.condicao?.todas?.length ? ` · ${a.condicao.todas.length} condição(ões)` : ''}
                    </p>
                  </Td>
                  <Td className="t-sm">
                    {AUTOMACAO_ACAO_LABELS[a.acao]}
                    <p className="t-label text-subtle mt-0.5">
                      {a.acao === 'TRANSFERIR_FUNIL'
                        ? `${a.funilDestino?.nome ?? '—'} · ${a.etapaDestino?.nome ?? '—'}`
                        : a.destinatario?.name ?? (a.destinatarioRole ? ROLE_LABELS[a.destinatarioRole] : '—')}
                    </p>
                  </Td>
                  <Td align="right" numeric>
                    <button onClick={() => verExecucoes(a)} className="text-accent-soft hover:text-accent">
                      {a._count.execucoes}
                    </button>
                  </Td>
                  <Td align="center">
                    <Badge tone={a.ativo ? 'pos' : 'neutral'}>{a.ativo ? 'Ativa' : 'Inativa'}</Badge>
                  </Td>
                  <Td align="right">
                    <div className="inline-flex gap-2">
                      <Button size="sm" onClick={() => abrirEdicao(a)}>Editar</Button>
                      <Button size="sm" variant={a.ativo ? 'danger' : 'subtle'} onClick={() => alternarAtivo(a)}>
                        {a.ativo ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </Td>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableShell>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line flex-none">
              <h2 className="t-h2 text-fg">{modal === 'nova' ? 'Nova automação' : `Editar — ${modal.nome}`}</h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={salvar} className="p-5 space-y-5 overflow-y-auto">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

              <div>
                <label className={lbl} htmlFor="a-nome">Nome *</label>
                <input id="a-nome" required value={form.nome} className={inp} maxLength={160}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
              </div>

              {/* ------------------------------------------------------ QUANDO */}
              <fieldset className="border border-line rounded-xl p-4 space-y-3">
                <legend className="t-label text-accent-soft px-1.5">Quando</legend>

                <div>
                  <label className={lbl} htmlFor="a-gat">Gatilho *</label>
                  <select id="a-gat" value={form.gatilho} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, gatilho: e.target.value as Gatilho }))}>
                    {GATILHOS.map((g) => <option key={g} value={g}>{AUTOMACAO_GATILHO_LABELS[g]}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl} htmlFor="a-funil">Funil</label>
                    <select id="a-funil" value={form.funilId} className={inp}
                      onChange={(e) => setForm((p) => ({ ...p, funilId: e.target.value, etapaId: '' }))}>
                      <option value="">Qualquer funil</option>
                      {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl} htmlFor="a-etapa">Etapa</label>
                    <select id="a-etapa" value={form.etapaId} className={inp} disabled={!form.funilId}
                      onChange={(e) => setForm((p) => ({ ...p, etapaId: e.target.value }))}>
                      <option value="">Qualquer etapa</option>
                      {etapasDoGatilho.map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* --------------------------------------------------------- E */}
              <fieldset className="border border-line rounded-xl p-4 space-y-3">
                <legend className="t-label text-accent-soft px-1.5">E (opcional)</legend>

                {form.regras.length === 0 && (
                  <p className="t-sm text-subtle">Sem condição, a automação vale para todo o escopo escolhido acima.</p>
                )}

                {form.regras.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <select value={r.campo} className={`${inp} max-w-[11rem]`}
                      onChange={(e) => setForm((p) => ({
                        ...p, regras: p.regras.map((x, j) => j === i ? { ...x, campo: e.target.value as Regra['campo'] } : x),
                      }))}>
                      {CAMPOS_CONDICAO.map((c) => <option key={c} value={c}>{CAMPO_CONDICAO_LABELS[c]}</option>)}
                    </select>
                    <select value={r.operador} className={`${inp} max-w-[9rem]`}
                      onChange={(e) => setForm((p) => ({
                        ...p, regras: p.regras.map((x, j) => j === i ? { ...x, operador: e.target.value as Regra['operador'] } : x),
                      }))}>
                      {OPERADORES.map((o) => <option key={o} value={o}>{OPERADOR_LABELS[o]}</option>)}
                    </select>
                    <input value={String(r.valor)} className={`${inp} flex-1 min-w-[6rem]`}
                      onChange={(e) => setForm((p) => ({
                        ...p, regras: p.regras.map((x, j) => j === i ? { ...x, valor: e.target.value } : x),
                      }))} />
                    <Button type="button" size="sm" variant="danger"
                      onClick={() => setForm((p) => ({ ...p, regras: p.regras.filter((_, j) => j !== i) }))}>
                      ✕
                    </Button>
                  </div>
                ))}

                <Button type="button" size="sm"
                  onClick={() => setForm((p) => ({ ...p, regras: [...p.regras, { campo: 'valor', operador: 'gte', valor: '' }] }))}>
                  + Condição
                </Button>
              </fieldset>

              {/* ------------------------------------------------------- ENTÃO */}
              <fieldset className="border border-line rounded-xl p-4 space-y-3">
                <legend className="t-label text-accent-soft px-1.5">Então</legend>

                <div>
                  <label className={lbl} htmlFor="a-acao">Ação *</label>
                  <select id="a-acao" value={form.acao} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, acao: e.target.value as Acao }))}>
                    {ACOES.map((a) => <option key={a} value={a}>{AUTOMACAO_ACAO_LABELS[a]}</option>)}
                  </select>
                </div>

                {form.acao === 'TRANSFERIR_FUNIL' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl} htmlFor="a-fd">Funil destino *</label>
                      <select id="a-fd" value={form.funilDestinoId} className={inp}
                        onChange={(e) => setForm((p) => ({ ...p, funilDestinoId: e.target.value, etapaDestinoId: '' }))}>
                        <option value="">Selecione</option>
                        {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl} htmlFor="a-ed">Etapa inicial *</label>
                      <select id="a-ed" value={form.etapaDestinoId} className={inp} disabled={!form.funilDestinoId}
                        onChange={(e) => setForm((p) => ({ ...p, etapaDestinoId: e.target.value }))}>
                        <option value="">Selecione</option>
                        {etapasDoDestino.map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {precisaDestinatario && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl} htmlFor="a-role">Perfil</label>
                        <select id="a-role" value={form.destinatarioRole} className={inp}
                          onChange={(e) => setForm((p) => ({ ...p, destinatarioRole: e.target.value, destinatarioUserId: '' }))}>
                          <option value="">—</option>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl} htmlFor="a-user">ou Usuário</label>
                        <select id="a-user" value={form.destinatarioUserId} className={inp}
                          onChange={(e) => setForm((p) => ({ ...p, destinatarioUserId: e.target.value, destinatarioRole: '' }))}>
                          <option value="">—</option>
                          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className={lbl} htmlFor="a-titulo">Título *</label>
                      <input id="a-titulo" value={form.titulo} className={inp} maxLength={200}
                        onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
                    </div>
                    <div>
                      <label className={lbl} htmlFor="a-msg">Mensagem</label>
                      <textarea id="a-msg" rows={2} value={form.mensagem} className={inp} maxLength={1000}
                        onChange={(e) => setForm((p) => ({ ...p, mensagem: e.target.value }))} />
                      <p className="t-sm text-subtle mt-1">
                        Use <code>{'{{card}}'}</code>, <code>{'{{cliente}}'}</code>, <code>{'{{funil}}'}</code> ou{' '}
                        <code>{'{{etapa}}'}</code> para inserir o contexto.
                      </p>
                    </div>
                  </>
                )}
              </fieldset>

              <div className="flex justify-end gap-3">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {execucoes && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setExecucoes(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line flex-none">
              <h2 className="t-h2 text-fg">Execuções — {execucoes.nome}</h2>
              <button onClick={() => setExecucoes(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              {execucoes.itens.length === 0 ? (
                <p className="t-sm text-subtle">Esta automação ainda não disparou.</p>
              ) : (
                <ul className="space-y-3">
                  {execucoes.itens.map((ex) => (
                    <li key={ex.id} className="border border-line rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <Badge tone={ex.status === 'SUCESSO' ? 'pos' : ex.status === 'FALHA' ? 'neg' : 'neutral'}>
                          {ex.status === 'SUCESSO' ? 'Sucesso' : ex.status === 'FALHA' ? 'Falha' : 'Ignorada'}
                        </Badge>
                        <span className="t-label text-subtle">{formatDateTime(ex.createdAt)}</span>
                      </div>
                      {ex.resultado && <p className="t-sm text-muted mt-1.5">{ex.resultado}</p>}
                      {ex.erro && <p className="t-sm text-neg mt-1.5">{ex.erro}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-5 border-t border-line flex justify-end flex-none">
              <Button onClick={() => setExecucoes(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
