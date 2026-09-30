'use client'

import { useState, useEffect, useCallback } from 'react'
import { getCurrentMonth, META_TIPO_LABELS } from '@/lib/utils'
import { figuraMoeda, figuraQuantidade, figuraPercentual } from '@/lib/format-financeiro'
import {
  META_TIPOS, META_DIRECOES, META_UNIDADES, PADRAO_POR_TIPO,
  DIRECAO_LABEL, UNIDADE_LABEL,
  type MetaDirecao, type MetaUnidade, type MetaTipo, type SituacaoMeta,
} from '@/lib/metas'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'

interface Meta {
  id: string
  tipo: string
  valor: number
  periodo: string
  direcao: MetaDirecao
  unidade: MetaUnidade
  realizado: number | null
  atingimento: number | null
  situacao: SituacaoMeta
  positivo: boolean
  diferenca: number | null
}

const SITUACAO: Record<SituacaoMeta, { label: string; tone: BadgeTone }> = {
  ATINGIDA: { label: 'Atingida', tone: 'pos' },
  NAO_ATINGIDA: { label: 'Não atingida', tone: 'neg' },
  SEM_REALIZADO: { label: 'Sem realizado', tone: 'neutral' },
}

/**
 * Formata pela UNIDADE da meta, não pelo tipo. É o que permite uma meta
 * percentual (MED = 2%) conviver com uma monetária (TPV) e uma de contagem
 * (Transações) na mesma lista, cada uma lida do jeito certo.
 */
function formatar(unidade: MetaUnidade, valor: number): string {
  if (unidade === 'PERCENTUAL') return figuraPercentual(valor, 2).completo
  if (unidade === 'QUANTIDADE') return figuraQuantidade(valor).completo
  return figuraMoeda(valor).completo
}

const FORM_VAZIO = {
  tipo: 'RECEITA_TARIFARIA' as MetaTipo,
  valor: '',
  periodo: getCurrentMonth(),
  direcao: PADRAO_POR_TIPO.RECEITA_TARIFARIA.direcao,
  unidade: PADRAO_POR_TIPO.RECEITA_TARIFARIA.unidade,
}

export default function MetasClient() {
  const [metas, setMetas] = useState<Meta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState(getCurrentMonth())
  const [modal, setModal] = useState<'nova' | Meta | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(FORM_VAZIO)

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscar = useCallback(async (p: string): Promise<Meta[] | null> => {
    const res = await fetch(`/api/metas?periodo=${p}`)
    if (!res.ok) return null
    const d = await res.json()
    return (d.metas ?? []) as Meta[]
  }, [])

  const aplicar = useCallback((lista: Meta[] | null) => {
    if (lista) setMetas(lista)
    setCarregando(false)
  }, [])

  const carregar = useCallback(async (p: string) => { aplicar(await buscar(p)) }, [buscar, aplicar])

  useEffect(() => {
    let vivo = true
    buscar(periodo).then((d) => { if (vivo) aplicar(d) })
    return () => { vivo = false }
  }, [periodo, buscar, aplicar])

  function abrirNova() {
    setForm({ ...FORM_VAZIO, periodo })
    setErro('')
    setModal('nova')
  }

  function abrirEdicao(m: Meta) {
    setForm({
      tipo: m.tipo as MetaTipo,
      valor: String(m.valor),
      periodo: m.periodo,
      direcao: m.direcao,
      unidade: m.unidade,
    })
    setErro('')
    setModal(m)
  }

  /** Trocar o tipo reposiciona unidade e direção no padrão daquele indicador. */
  function trocarTipo(tipo: MetaTipo) {
    const padrao = PADRAO_POR_TIPO[tipo]
    setForm((p) => ({ ...p, tipo, direcao: padrao.direcao, unidade: padrao.unidade }))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')

    const editando = modal !== 'nova' && modal !== null
    const res = await fetch(editando ? `/api/metas/${modal.id}` : '/api/metas', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: form.tipo,
        periodo: form.periodo,
        valor: parseFloat(form.valor.replace(',', '.')) || 0,
        direcao: form.direcao,
        unidade: form.unidade,
      }),
    })

    if (res.ok) {
      setModal(null)
      carregar(periodo)
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar a meta.')
    }
    setSalvando(false)
  }

  async function excluir(m: Meta) {
    if (!confirm(`Excluir a meta de ${META_TIPO_LABELS[m.tipo] ?? m.tipo} em ${m.periodo}?`)) return
    const res = await fetch(`/api/metas/${m.id}`, { method: 'DELETE' })
    if (res.ok) carregar(periodo)
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  const semMeta = META_TIPOS.filter((t) => !metas.some((m) => m.tipo === t))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Metas"
        sub="A meta é só o esperado. O realizado vem do Lançamento Diário e nunca é digitado aqui."
        actions={
          <div className="flex items-center gap-2">
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
              aria-label="Período" className="bp-field w-auto" />
            <Button variant="primary" onClick={abrirNova}>+ Definir meta</Button>
          </div>
        }
      />

      {carregando ? (
        <p className="t-sm text-subtle">Carregando…</p>
      ) : metas.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhuma meta definida para este período"
            description="Defina o alvo de cada indicador. O realizado é apurado automaticamente."
            action={<Button variant="primary" onClick={abrirNova}>Definir meta</Button>}
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {metas.map((m) => {
            const s = SITUACAO[m.situacao]
            // A barra mostra CUMPRIMENTO, que já respeita a direção: 100% é
            // "no alvo" tanto para TPV quanto para MED.
            const pct = m.atingimento === null ? null : Math.min(m.atingimento, 150)
            const cor = m.situacao === 'SEM_REALIZADO' ? 'bg-surface-2'
              : m.positivo ? 'bg-pos'
              : (m.atingimento ?? 0) >= 70 ? 'bg-warn' : 'bg-neg'

            return (
              <Panel key={m.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="t-body font-semibold text-fg">
                      {META_TIPO_LABELS[m.tipo] ?? m.tipo}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      <Badge>{DIRECAO_LABEL[m.direcao]}</Badge>
                      <span className="t-label text-subtle">
                        Meta {formatar(m.unidade, m.valor)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="text-right">
                      <p className={`t-h2 tabular-nums ${
                        m.situacao === 'SEM_REALIZADO' ? 'text-subtle'
                          : m.positivo ? 'text-pos' : 'text-neg'
                      }`}>
                        {m.realizado === null ? '—' : formatar(m.unidade, m.realizado)}
                      </p>
                      <p className="t-label text-subtle mt-1">
                        {m.atingimento === null
                          ? 'Sem realizado no período'
                          : `${m.atingimento.toFixed(0)}% de cumprimento`}
                      </p>
                    </div>
                    <div className="inline-flex gap-1.5">
                      <Button size="sm" onClick={() => abrirEdicao(m)}>Editar</Button>
                      <Button size="sm" variant="danger" onClick={() => excluir(m)}>Excluir</Button>
                    </div>
                  </div>
                </div>

                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mt-4">
                  <div className={`h-full rounded-full transition-all duration-[380ms] ease-bp ${cor}`}
                    style={{ width: `${Math.max(pct ?? 0, 0) / 1.5}%` }} />
                </div>
                {m.diferenca !== null && (
                  <p className="t-label text-subtle mt-2">
                    {m.diferenca === 0
                      ? 'Exatamente no alvo.'
                      : `${formatar(m.unidade, Math.abs(m.diferenca))} ${m.diferenca > 0 ? 'acima' : 'abaixo'} da meta.`}
                  </p>
                )}
              </Panel>
            )
          })}

          {semMeta.length > 0 && (
            <p className="t-label text-subtle">
              Sem meta definida para: {semMeta.map((t) => META_TIPO_LABELS[t] ?? t).join(', ')}
            </p>
          )}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal === 'nova' ? 'Definir meta' : `Editar — ${META_TIPO_LABELS[modal.tipo] ?? modal.tipo}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={salvar} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

              {modal === 'nova' && (
                <>
                  <div>
                    <label className={lbl} htmlFor="mt-tipo">Indicador *</label>
                    <select id="mt-tipo" required value={form.tipo} className={inp}
                      onChange={(e) => trocarTipo(e.target.value as MetaTipo)}>
                      {META_TIPOS.map((t) => (
                        <option key={t} value={t}>{META_TIPO_LABELS[t] ?? t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl} htmlFor="mt-periodo">Período *</label>
                    <input id="mt-periodo" required type="month" value={form.periodo} className={inp}
                      onChange={(e) => setForm((p) => ({ ...p, periodo: e.target.value }))} />
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="mt-unidade">Unidade *</label>
                  <select id="mt-unidade" value={form.unidade} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, unidade: e.target.value as MetaUnidade }))}>
                    {META_UNIDADES.map((u) => <option key={u} value={u}>{UNIDADE_LABEL[u]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="mt-valor">
                    Valor da meta {form.unidade === 'PERCENTUAL' ? '(%)' : form.unidade === 'VALOR' ? '(R$)' : ''} *
                  </label>
                  <input id="mt-valor" required type="number" step="0.01" min="0"
                    max={form.unidade === 'PERCENTUAL' ? 100 : undefined}
                    value={form.valor} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="mt-direcao">Direção da meta *</label>
                <select id="mt-direcao" value={form.direcao} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, direcao: e.target.value as MetaDirecao }))}>
                  {META_DIRECOES.map((d) => <option key={d} value={d}>{DIRECAO_LABEL[d]}</option>)}
                </select>
                <p className="t-label text-subtle mt-1.5">
                  {form.direcao === 'MENOR_MELHOR'
                    ? 'A meta é atingida quando o realizado fica ABAIXO do alvo. Ex.: MED de 2% com realizado de 1,5%.'
                    : 'A meta é atingida quando o realizado fica ACIMA do alvo. Ex.: TPV e receita.'}
                </p>
              </div>

              <p className="t-sm text-subtle">
                O realizado é apurado automaticamente do Lançamento Diário — não há campo para digitá-lo.
              </p>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
