'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { ROLE_LABELS } from '@/lib/utils'

const ACOES = ['ver', 'editar', 'mover', 'criar', 'transferir', 'administrar'] as const
type Acao = (typeof ACOES)[number]

const ACAO_LABEL: Record<Acao, string> = {
  ver: 'Visualizar', editar: 'Editar', mover: 'Mover',
  criar: 'Criar', transferir: 'Transferir', administrar: 'Administrar',
}

const ROLES = ['ADMIN', 'OPERACIONAL', 'COMERCIAL'] as const
const TIPOS = ['NORMAL', 'GANHO', 'PERDIDO'] as const

interface Etapa {
  id: string; nome: string; descricao: string | null; ordem: number
  cor: string | null; ativo: boolean; tipo: 'NORMAL' | 'GANHO' | 'PERDIDO'
  _count?: { deals: number }
}

interface Permissao {
  id?: string
  role: string | null
  userId: string | null
  user?: { id: string; name: string; email: string } | null
  ver: boolean; editar: boolean; mover: boolean
  criar: boolean; transferir: boolean; administrar: boolean
  apenasProprios: boolean
}

interface Usuario { id: string; name: string; email: string; role: string }

interface Funil {
  id: string; nome: string; descricao: string | null; area: string | null
  ativo: boolean; exigeCliente: boolean
}

interface FormEtapa {
  nome: string
  descricao: string
  cor: string
  tipo: 'NORMAL' | 'GANHO' | 'PERDIDO'
}

const ETAPA_VAZIA: FormEtapa = { nome: '', descricao: '', cor: '', tipo: 'NORMAL' }

export default function FunilDetailClient({ funilId }: { funilId: string }) {
  const [funil, setFunil] = useState<Funil | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  const [modalEtapa, setModalEtapa] = useState<'nova' | Etapa | null>(null)
  const [formEtapa, setFormEtapa] = useState<FormEtapa>(ETAPA_VAZIA)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroPerm, setErroPerm] = useState('')
  const [okPerm, setOkPerm] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch(`/api/pipeline/funis/${funilId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/pipeline/funis/${funilId}/etapas`).then((r) => (r.ok ? r.json() : { etapas: [] })),
      fetch(`/api/pipeline/funis/${funilId}/permissoes`).then((r) => (r.ok ? r.json() : { permissoes: [], usuarios: [] })),
    ])
      .then(([f, e, p]) => {
        if (!vivo) return
        setFunil(f?.funil ?? null)
        setEtapas(e.etapas ?? [])
        setPermissoes(p.permissoes ?? [])
        setUsuarios(p.usuarios ?? [])
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [funilId, versao])

  // ---------------------------------------------------------------- Etapas

  function abrirNovaEtapa() { setFormEtapa(ETAPA_VAZIA); setErro(''); setModalEtapa('nova') }

  function abrirEdicaoEtapa(e: Etapa) {
    setFormEtapa({ nome: e.nome, descricao: e.descricao ?? '', cor: e.cor ?? '', tipo: e.tipo })
    setErro(''); setModalEtapa(e)
  }

  async function salvarEtapa(ev: React.FormEvent) {
    ev.preventDefault()
    setSalvando(true); setErro('')
    const editando = modalEtapa !== 'nova' && modalEtapa !== null
    const res = await fetch(
      editando ? `/api/pipeline/etapas/${modalEtapa.id}` : `/api/pipeline/funis/${funilId}/etapas`,
      {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formEtapa),
      },
    )
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar a etapa.')
      setSalvando(false)
      return
    }
    setModalEtapa(null); setSalvando(false); recarregar()
  }

  async function reordenarEtapa(index: number, delta: number) {
    const alvo = index + delta
    if (alvo < 0 || alvo >= etapas.length) return
    const ids = etapas.map((e) => e.id)
    ;[ids[index], ids[alvo]] = [ids[alvo], ids[index]]
    setEtapas((prev) => {
      const copia = [...prev]
      ;[copia[index], copia[alvo]] = [copia[alvo], copia[index]]
      return copia
    })
    const res = await fetch(`/api/pipeline/funis/${funilId}/etapas/ordem`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordem: ids }),
    })
    if (!res.ok) recarregar()
  }

  async function alternarEtapa(e: Etapa) {
    const cards = e._count?.deals ?? 0
    let etapaDestinoId: string | null = null

    if (e.ativo && cards > 0) {
      const opcoes = etapas.filter((o) => o.id !== e.id && o.ativo)
      if (opcoes.length === 0) {
        alert(`Esta etapa tem ${cards} card(s) e não há outra etapa ativa para recebê-los.`)
        return
      }
      const escolha = prompt(
        `A etapa "${e.nome}" tem ${cards} card(s). Para qual etapa mover?\n\n` +
        opcoes.map((o, i) => `${i + 1}. ${o.nome}`).join('\n'),
        '1',
      )
      if (!escolha) return
      const idx = parseInt(escolha, 10) - 1
      if (!(idx >= 0 && idx < opcoes.length)) { alert('Opção inválida.'); return }
      etapaDestinoId = opcoes[idx].id
    }

    const res = await fetch(`/api/pipeline/etapas/${e.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !e.ativo, etapaDestinoId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível alterar a etapa.')
      return
    }
    recarregar()
  }

  // ----------------------------------------------------------- Permissões

  function addRegra(tipo: 'role' | 'user') {
    setPermissoes((p) => [...p, {
      role: tipo === 'role' ? 'COMERCIAL' : null,
      userId: tipo === 'user' ? (usuarios[0]?.id ?? null) : null,
      ver: true, editar: false, mover: false, criar: false,
      transferir: false, administrar: false, apenasProprios: false,
    }])
    setOkPerm('')
  }

  function atualizarRegra(i: number, patch: Partial<Permissao>) {
    setPermissoes((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    setOkPerm('')
  }

  async function salvarPermissoes() {
    setSalvando(true); setErroPerm(''); setOkPerm('')
    const res = await fetch(`/api/pipeline/funis/${funilId}/permissoes`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissoes }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErroPerm(d.error ?? 'Não foi possível salvar as permissões.')
      setSalvando(false)
      return
    }
    const d = await res.json()
    setPermissoes(d.permissoes)
    setOkPerm('Permissões salvas.')
    setSalvando(false)
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  if (carregando) return <p className="t-sm text-subtle">Carregando...</p>
  if (!funil) return <p className="t-sm text-subtle">Funil não encontrado.</p>

  return (
    <div className="space-y-8">
      <PageHeader
        title={funil.nome}
        sub={funil.descricao ?? funil.area ?? undefined}
        actions={<Link href="/dashboard/pipeline/funis"><Button>Voltar aos funis</Button></Link>}
      />

      {/* ------------------------------------------------------------ Etapas */}
      <Panel className="space-y-5">
        <PanelHeader
          title="Etapas"
          sub="A ordem define as colunas do quadro. Etapas não são excluídas — apenas inativadas."
          actions={<Button variant="primary" size="sm" onClick={abrirNovaEtapa}>+ Nova Etapa</Button>}
        />

        {etapas.length === 0 ? (
          <p className="t-sm text-subtle">Nenhuma etapa. Crie a primeira para o funil aparecer no quadro.</p>
        ) : (
          <ul className="divide-y divide-line">
            {etapas.map((e, i) => (
              <li key={e.id} className={`flex items-center gap-3 py-3 flex-wrap ${e.ativo ? '' : 'opacity-60'}`}>
                <span className="t-label text-subtle w-6 tabular-nums">{i + 1}</span>
                {e.cor && <span aria-hidden className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: e.cor }} />}
                <div className="min-w-0 flex-1">
                  <p className="t-body text-fg">{e.nome}</p>
                  {e.descricao && <p className="t-sm text-subtle mt-0.5">{e.descricao}</p>}
                </div>
                {e.tipo !== 'NORMAL' && (
                  <Badge tone={e.tipo === 'GANHO' ? 'pos' : 'neg'}>{e.tipo === 'GANHO' ? 'Ganho' : 'Perdido'}</Badge>
                )}
                <span className="t-label text-subtle">{e._count?.deals ?? 0} card(s)</span>
                {!e.ativo && <Badge tone="neutral">Inativa</Badge>}
                <div className="inline-flex gap-1">
                  <Button size="sm" variant="subtle" onClick={() => reordenarEtapa(i, -1)} disabled={i === 0} aria-label="Subir">↑</Button>
                  <Button size="sm" variant="subtle" onClick={() => reordenarEtapa(i, 1)} disabled={i === etapas.length - 1} aria-label="Descer">↓</Button>
                  <Button size="sm" onClick={() => abrirEdicaoEtapa(e)}>Editar</Button>
                  <Button size="sm" variant={e.ativo ? 'danger' : 'subtle'} onClick={() => alternarEtapa(e)}>
                    {e.ativo ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ------------------------------------------------------- Permissões */}
      <Panel className="space-y-5">
        <PanelHeader
          title="Permissões"
          sub="Cada regra vale para uma role ou um usuário. Sem nenhuma regra, o funil fica visível para quem já tem acesso ao Pipeline."
          actions={
            <>
              <Button size="sm" onClick={() => addRegra('role')}>+ Role</Button>
              <Button size="sm" onClick={() => addRegra('user')}>+ Usuário</Button>
            </>
          }
        />

        {erroPerm && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erroPerm}</div>}
        {okPerm && <div className="bg-pos/10 border border-pos/25 text-pos px-3 py-2 rounded-lg t-sm">{okPerm}</div>}

        {permissoes.length === 0 ? (
          <p className="t-sm text-subtle">
            Nenhuma regra específica. O funil herda o acesso do módulo: quem tem <code>view_pipeline</code> visualiza,
            e quem tem <code>manage_pipeline</code> opera. O ADMIN sempre tem acesso total.
          </p>
        ) : (
          <div className="space-y-3">
            {permissoes.map((p, i) => (
              <div key={p.id ?? `nova-${i}`} className="border border-line rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {p.role !== null ? (
                    <select value={p.role} className={`${inp} max-w-[12rem]`}
                      onChange={(ev) => atualizarRegra(i, { role: ev.target.value })}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                    </select>
                  ) : (
                    <select value={p.userId ?? ''} className={`${inp} max-w-[18rem]`}
                      onChange={(ev) => atualizarRegra(i, { userId: ev.target.value })}>
                      {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                    </select>
                  )}
                  <Badge tone="neutral">{p.role !== null ? 'Role' : 'Usuário'}</Badge>
                  <Button size="sm" variant="danger" className="ml-auto"
                    onClick={() => setPermissoes((prev) => prev.filter((_, idx) => idx !== i))}>
                    Remover
                  </Button>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {ACOES.map((a) => (
                    <label key={a} className="flex items-center gap-2 cursor-pointer t-sm text-muted">
                      <input type="checkbox" checked={p[a]}
                        onChange={(ev) => atualizarRegra(i, { [a]: ev.target.checked } as Partial<Permissao>)} />
                      {ACAO_LABEL[a]}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer t-sm text-muted">
                    <input type="checkbox" checked={p.apenasProprios}
                      onChange={(ev) => atualizarRegra(i, { apenasProprios: ev.target.checked })} />
                    Somente os próprios cards
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onClick={salvarPermissoes} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar permissões'}
          </Button>
        </div>
      </Panel>

      {modalEtapa && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModalEtapa(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">{modalEtapa === 'nova' ? 'Nova Etapa' : `Editar — ${modalEtapa.nome}`}</h2>
              <button onClick={() => setModalEtapa(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvarEtapa} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

              <div>
                <label className={lbl} htmlFor="et-nome">Nome *</label>
                <input id="et-nome" required value={formEtapa.nome} className={inp}
                  onChange={(e) => setFormEtapa((p) => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label className={lbl} htmlFor="et-desc">Descrição</label>
                <textarea id="et-desc" rows={2} maxLength={500} value={formEtapa.descricao} className={inp}
                  onChange={(e) => setFormEtapa((p) => ({ ...p, descricao: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl} htmlFor="et-tipo">Comportamento</label>
                  <select id="et-tipo" value={formEtapa.tipo} className={inp}
                    onChange={(e) => setFormEtapa((p) => ({ ...p, tipo: e.target.value as typeof p.tipo }))}>
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>
                        {t === 'NORMAL' ? 'Normal' : t === 'GANHO' ? 'Encerra como ganho' : 'Encerra como perdido'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="et-cor">Cor</label>
                  <input id="et-cor" type="color" value={formEtapa.cor || '#2F6BFF'}
                    className="w-full h-[2.6rem] bg-bg border border-line rounded-lg px-2"
                    onChange={(e) => setFormEtapa((p) => ({ ...p, cor: e.target.value }))} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModalEtapa(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
