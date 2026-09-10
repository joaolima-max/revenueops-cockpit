'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import RenderCampo, { largura } from '@/components/formularios/RenderCampo'
import { formatDateTime } from '@/lib/utils'
import {
  TIPOS_CAMPO, TIPO_CAMPO_LABELS, aceitaOpcoes, ehDecorativo, validarDefinicao,
  type DefinicaoFormulario, type CampoDefinicao, type SecaoDefinicao, type TipoCampo,
} from '@/lib/formularios'

interface Versao {
  id: string; versao: number; publicadaEm: string | null; definicao: DefinicaoFormulario
  _count: { respostas: number }
  links: Array<{
    id: string; token: string; expiraEm: string | null; usosMax: number | null
    usos: number; revogadoEm: string | null
    cliente: { id: string; nome: string } | null
    _count: { respostas: number }
  }>
}

interface Formulario {
  id: string; nome: string; descricao: string | null; ativo: boolean
  versoes: Versao[]
}

function novoId(prefixo: string): string {
  return `${prefixo}-${Math.random().toString(36).slice(2, 9)}`
}

export default function ConstrutorClient({ formularioId, podeGerenciar }: {
  formularioId: string
  podeGerenciar: boolean
}) {
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [versaoId, setVersaoId] = useState<string | null>(null)
  const [def, setDef] = useState<DefinicaoFormulario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [recarregar, setRecarregar] = useState(0)

  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [aba, setAba] = useState<'campos' | 'aparencia' | 'links'>('campos')

  useEffect(() => {
    let vivo = true
    fetch(`/api/formularios/${formularioId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.formulario) return
        setFormulario(d.formulario)
        const atual = d.formulario.versoes[0]
        if (atual) { setVersaoId(atual.id); setDef(atual.definicao) }
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [formularioId, recarregar])

  const versao = useMemo(
    () => formulario?.versoes.find((v) => v.id === versaoId) ?? null,
    [formulario, versaoId],
  )
  const congelada = (versao?._count.respostas ?? 0) > 0

  function trocarVersao(id: string) {
    const v = formulario?.versoes.find((x) => x.id === id)
    if (!v) return
    setVersaoId(id); setDef(v.definicao); setSelecionado(null); setAviso(''); setErro('')
  }

  // ------------------------------------------------------------- edição

  function addCampo(tipo: TipoCampo, secaoId: string) {
    if (!def) return
    const campo: CampoDefinicao = {
      id: novoId('c'), tipo,
      rotulo: TIPO_CAMPO_LABELS[tipo],
      obrigatorio: false, colunas: 12,
      ...(aceitaOpcoes(tipo) ? { opcoes: ['Opção 1', 'Opção 2'] } : {}),
    }
    setDef({
      ...def,
      secoes: def.secoes.map((s) => s.id === secaoId ? { ...s, campos: [...s.campos, campo] } : s),
    })
    setSelecionado(campo.id)
  }

  function atualizarCampo(id: string, patch: Partial<CampoDefinicao>) {
    if (!def) return
    setDef({
      ...def,
      secoes: def.secoes.map((s) => ({
        ...s, campos: s.campos.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    })
  }

  function removerCampo(id: string) {
    if (!def) return
    setDef({ ...def, secoes: def.secoes.map((s) => ({ ...s, campos: s.campos.filter((c) => c.id !== id) })) })
    if (selecionado === id) setSelecionado(null)
  }

  function moverCampo(secaoId: string, index: number, delta: number) {
    if (!def) return
    setDef({
      ...def,
      secoes: def.secoes.map((s) => {
        if (s.id !== secaoId) return s
        const alvo = index + delta
        if (alvo < 0 || alvo >= s.campos.length) return s
        const campos = [...s.campos]
        ;[campos[index], campos[alvo]] = [campos[alvo], campos[index]]
        return { ...s, campos }
      }),
    })
  }

  /** Solta o campo arrastado na posição do campo de destino, dentro da seção. */
  function soltarEm(secaoId: string, destinoId: string) {
    if (!def || !arrastando || arrastando === destinoId) return
    setDef({
      ...def,
      secoes: def.secoes.map((s) => {
        if (s.id !== secaoId) return s
        const de = s.campos.findIndex((c) => c.id === arrastando)
        const para = s.campos.findIndex((c) => c.id === destinoId)
        if (de === -1 || para === -1) return s
        const campos = [...s.campos]
        const [movido] = campos.splice(de, 1)
        campos.splice(para, 0, movido)
        return { ...s, campos }
      }),
    })
    setArrastando(null)
  }

  function addSecao() {
    if (!def) return
    const secao: SecaoDefinicao = { id: novoId('s'), titulo: 'Nova seção', campos: [] }
    setDef({ ...def, secoes: [...def.secoes, secao] })
  }

  function atualizarSecao(id: string, patch: Partial<SecaoDefinicao>) {
    if (!def) return
    setDef({ ...def, secoes: def.secoes.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  function removerSecao(id: string) {
    if (!def || def.secoes.length <= 1) return
    setDef({ ...def, secoes: def.secoes.filter((s) => s.id !== id) })
  }

  // ------------------------------------------------------------- salvar

  async function salvar(publicar: boolean) {
    if (!def || !versaoId) return
    const problema = validarDefinicao(def)
    if (problema) { setErro(problema); setAviso(''); return }

    setSalvando(true); setErro(''); setAviso('')
    const res = await fetch(`/api/formularios/versoes/${versaoId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definicao: def, publicar }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar.'); setSalvando(false); return
    }
    const d = await res.json()
    setAviso(d.novaVersaoCriada
      ? `A versão anterior já tinha respostas, então foi criada a versão ${d.versao.versao}.`
      : publicar ? 'Versão publicada.' : 'Rascunho salvo.')
    setSalvando(false)
    setRecarregar((v) => v + 1)
    if (d.novaVersaoCriada) setVersaoId(d.versao.id)
  }

  async function gerarLink() {
    if (!versaoId) return
    const res = await fetch(`/api/formularios/versoes/${versaoId}/links`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível gerar o link.'); return
    }
    setRecarregar((v) => v + 1)
  }

  async function revogarLink(id: string, revogado: boolean) {
    await fetch(`/api/formularios/links/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revogado: !revogado }),
    })
    setRecarregar((v) => v + 1)
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  if (carregando) return <p className="t-sm text-subtle">Carregando...</p>
  if (!formulario || !def) return <p className="t-sm text-subtle">Formulário não encontrado.</p>

  const campoSel = def.secoes.flatMap((s) => s.campos).find((c) => c.id === selecionado) ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title={formulario.nome}
        sub={formulario.descricao ?? undefined}
        actions={
          <>
            <Link href="/dashboard/formularios"><Button>Voltar</Button></Link>
            {podeGerenciar && (
              <>
                <Button onClick={() => salvar(false)} disabled={salvando}>Salvar rascunho</Button>
                <Button variant="primary" onClick={() => salvar(true)} disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Publicar'}
                </Button>
              </>
            )}
          </>
        }
      />

      {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-4 py-2.5 rounded-xl t-sm">{erro}</div>}
      {aviso && <div className="bg-pos/10 border border-pos/25 text-pos px-4 py-2.5 rounded-xl t-sm">{aviso}</div>}

      <div className="flex items-center gap-3 flex-wrap">
        <select value={versaoId ?? ''} onChange={(e) => trocarVersao(e.target.value)}
          aria-label="Versão"
          className="bg-surface border border-line rounded-lg px-3 py-2 t-sm text-muted focus:outline-none focus:border-accent">
          {formulario.versoes.map((v) => (
            <option key={v.id} value={v.id}>
              Versão {v.versao}{v.publicadaEm ? ' · publicada' : ' · rascunho'}
              {v._count.respostas > 0 ? ` · ${v._count.respostas} resposta(s)` : ''}
            </option>
          ))}
        </select>
        {versao?.publicadaEm && <Badge tone="pos">Publicada</Badge>}
        {congelada && <Badge tone="warn">Imutável — editar cria a próxima versão</Badge>}
      </div>

      <div className="flex gap-2">
        {(['campos', 'aparencia', 'links'] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`px-3.5 py-2 rounded-lg t-sm font-medium border transition-colors duration-[180ms] ${
              aba === a ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-line text-muted hover:text-fg'
            }`}>
            {a === 'campos' ? 'Campos' : a === 'aparencia' ? 'Aparência' : 'Links externos'}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------- CAMPOS */}
      {aba === 'campos' && (
        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_17rem]">
          {podeGerenciar && (
            <Panel className="!p-4 h-fit">
              <p className="t-label text-subtle mb-3">Adicionar campo</p>
              <div className="flex flex-col gap-1 max-h-[32rem] overflow-y-auto">
                {TIPOS_CAMPO.map((t) => (
                  <button key={t} type="button"
                    onClick={() => addCampo(t, def.secoes[def.secoes.length - 1].id)}
                    className="text-left px-2.5 py-1.5 rounded-lg t-sm text-muted hover:text-fg hover:bg-accent-ghost transition-colors duration-[180ms]">
                    {TIPO_CAMPO_LABELS[t]}
                  </button>
                ))}
              </div>
              <Button size="sm" className="w-full mt-3" onClick={addSecao}>+ Nova seção</Button>
            </Panel>
          )}

          <div className="space-y-4 min-w-0">
            {def.secoes.map((secao) => (
              <Panel key={secao.id}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  {podeGerenciar ? (
                    <input value={secao.titulo ?? ''} className={`${inp} max-w-sm`} placeholder="Título da seção"
                      onChange={(e) => atualizarSecao(secao.id, { titulo: e.target.value })} />
                  ) : (
                    <h3 className="t-h2 text-fg">{secao.titulo}</h3>
                  )}
                  {podeGerenciar && def.secoes.length > 1 && (
                    <Button size="sm" variant="danger" onClick={() => removerSecao(secao.id)}>Remover seção</Button>
                  )}
                </div>

                {secao.campos.length === 0 ? (
                  <p className="t-sm text-subtle py-6 text-center border border-dashed border-line rounded-xl">
                    Escolha um tipo de campo à esquerda para começar.
                  </p>
                ) : (
                  <div className="grid grid-cols-12 gap-3">
                    {secao.campos.map((campo, i) => (
                      <div
                        key={campo.id}
                        draggable={podeGerenciar}
                        onDragStart={() => setArrastando(campo.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => soltarEm(secao.id, campo.id)}
                        onClick={() => podeGerenciar && setSelecionado(campo.id)}
                        className={`${largura(campo)} border rounded-xl p-3 transition-colors duration-[180ms] ${
                          selecionado === campo.id ? 'border-accent bg-accent/5' : 'border-line hover:border-line-2'
                        } ${podeGerenciar ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="t-label text-subtle">{TIPO_CAMPO_LABELS[campo.tipo]}</span>
                          {podeGerenciar && (
                            <div className="flex gap-1">
                              <button type="button" aria-label="Subir" onClick={(e) => { e.stopPropagation(); moverCampo(secao.id, i, -1) }}
                                className="t-label text-subtle hover:text-fg px-1">↑</button>
                              <button type="button" aria-label="Descer" onClick={(e) => { e.stopPropagation(); moverCampo(secao.id, i, 1) }}
                                className="t-label text-subtle hover:text-fg px-1">↓</button>
                              <button type="button" aria-label="Remover" onClick={(e) => { e.stopPropagation(); removerCampo(campo.id) }}
                                className="t-label text-subtle hover:text-neg px-1">✕</button>
                            </div>
                          )}
                        </div>
                        <RenderCampo campo={campo} valor={campo.valorPadrao} somenteLeitura />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            ))}
          </div>

          {podeGerenciar && (
            <Panel className="!p-4 h-fit">
              <p className="t-label text-subtle mb-3">Propriedades</p>
              {!campoSel ? (
                <p className="t-sm text-subtle">Selecione um campo para editar.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={lbl} htmlFor="p-rotulo">Rótulo</label>
                    <input id="p-rotulo" value={campoSel.rotulo} className={inp}
                      onChange={(e) => atualizarCampo(campoSel.id, { rotulo: e.target.value })} />
                  </div>

                  {!ehDecorativo(campoSel.tipo) && (
                    <>
                      <div>
                        <label className={lbl} htmlFor="p-place">Placeholder</label>
                        <input id="p-place" value={campoSel.placeholder ?? ''} className={inp}
                          onChange={(e) => atualizarCampo(campoSel.id, { placeholder: e.target.value })} />
                      </div>
                      <div>
                        <label className={lbl} htmlFor="p-ajuda">Texto de ajuda</label>
                        <input id="p-ajuda" value={campoSel.ajuda ?? ''} className={inp}
                          onChange={(e) => atualizarCampo(campoSel.id, { ajuda: e.target.value })} />
                      </div>
                      <label className="flex items-center gap-2 t-sm text-muted cursor-pointer">
                        <input type="checkbox" checked={campoSel.obrigatorio ?? false}
                          onChange={(e) => atualizarCampo(campoSel.id, { obrigatorio: e.target.checked })} />
                        Obrigatório
                      </label>
                      <div>
                        <label className={lbl} htmlFor="p-col">Largura</label>
                        <select id="p-col" value={campoSel.colunas ?? 12} className={inp}
                          onChange={(e) => atualizarCampo(campoSel.id, { colunas: Number(e.target.value) })}>
                          <option value={12}>Linha inteira</option>
                          <option value={6}>Metade</option>
                          <option value={4}>Um terço</option>
                        </select>
                      </div>
                    </>
                  )}

                  {aceitaOpcoes(campoSel.tipo) && (
                    <div>
                      <label className={lbl} htmlFor="p-op">Opções (uma por linha)</label>
                      <textarea id="p-op" rows={4} className={inp} value={(campoSel.opcoes ?? []).join('\n')}
                        onChange={(e) => atualizarCampo(campoSel.id, {
                          opcoes: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                        })} />
                    </div>
                  )}

                  {(ehDecorativo(campoSel.tipo) || campoSel.tipo === 'ACEITE' || campoSel.tipo === 'CHECKBOX') && (
                    <div>
                      <label className={lbl} htmlFor="p-cont">
                        {campoSel.tipo === 'IMAGEM' ? 'URL da imagem' : 'Conteúdo'}
                      </label>
                      <textarea id="p-cont" rows={3} className={inp} value={campoSel.conteudo ?? ''}
                        onChange={(e) => atualizarCampo(campoSel.id, { conteudo: e.target.value })} />
                    </div>
                  )}

                  {['NUMERO', 'MOEDA', 'PERCENTUAL', 'VOLUMETRIA'].includes(campoSel.tipo) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl} htmlFor="p-min">Mínimo</label>
                        <input id="p-min" type="number" className={inp} value={campoSel.min ?? ''}
                          onChange={(e) => atualizarCampo(campoSel.id, { min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className={lbl} htmlFor="p-max">Máximo</label>
                        <input id="p-max" type="number" className={inp} value={campoSel.max ?? ''}
                          onChange={(e) => atualizarCampo(campoSel.id, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- APARÊNCIA */}
      {aba === 'aparencia' && (
        <Panel className="max-w-2xl space-y-4">
          <PanelHeader title="Aparência" sub="O que o respondente vê antes e depois de preencher." />
          {([
            ['titulo', 'Título'], ['subtitulo', 'Subtítulo'], ['introducao', 'Introdução'],
            ['capaUrl', 'URL da capa'], ['logoUrl', 'URL do logo'],
            ['rodape', 'Rodapé'], ['mensagemFinal', 'Mensagem de sucesso'],
          ] as const).map(([chave, rotulo]) => (
            <div key={chave}>
              <label className={lbl} htmlFor={`ap-${chave}`}>{rotulo}</label>
              {chave === 'introducao' || chave === 'mensagemFinal' ? (
                <textarea id={`ap-${chave}`} rows={2} className={inp} disabled={!podeGerenciar}
                  value={def.aparencia[chave] ?? ''}
                  onChange={(e) => setDef({ ...def, aparencia: { ...def.aparencia, [chave]: e.target.value } })} />
              ) : (
                <input id={`ap-${chave}`} className={inp} disabled={!podeGerenciar}
                  value={def.aparencia[chave] ?? ''}
                  onChange={(e) => setDef({ ...def, aparencia: { ...def.aparencia, [chave]: e.target.value } })} />
              )}
            </div>
          ))}
        </Panel>
      )}

      {/* ----------------------------------------------------------- LINKS */}
      {aba === 'links' && (
        <Panel className="space-y-4">
          <PanelHeader
            title="Links externos"
            sub="O endereço usa um token aleatório, nunca o id interno."
            actions={podeGerenciar && versao?.publicadaEm
              ? <Button size="sm" variant="primary" onClick={gerarLink}>+ Gerar link</Button>
              : undefined}
          />

          {!versao?.publicadaEm && (
            <p className="t-sm text-warn">Publique a versão para poder gerar links.</p>
          )}

          {(versao?.links ?? []).length === 0 ? (
            <p className="t-sm text-subtle">Nenhum link gerado para esta versão.</p>
          ) : (
            <ul className="space-y-2">
              {(versao?.links ?? []).map((l) => (
                <li key={l.id} className={`border border-line rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${l.revogadoEm ? 'opacity-60' : ''}`}>
                  <div className="min-w-0">
                    <code className="t-sm text-fg break-all">/f/{l.token}</code>
                    <p className="t-label text-subtle mt-1">
                      {l._count.respostas} resposta(s) · {l.usos} uso(s)
                      {l.usosMax ? ` de ${l.usosMax}` : ''}
                      {l.expiraEm ? ` · expira ${formatDateTime(l.expiraEm)}` : ''}
                      {l.cliente ? ` · ${l.cliente.nome}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.revogadoEm && <Badge tone="neutral">Revogado</Badge>}
                    <Button size="sm" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/f/${l.token}`)}>
                      Copiar
                    </Button>
                    {podeGerenciar && (
                      <Button size="sm" variant={l.revogadoEm ? 'subtle' : 'danger'}
                        onClick={() => revogarLink(l.id, !!l.revogadoEm)}>
                        {l.revogadoEm ? 'Reativar' : 'Revogar'}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  )
}
