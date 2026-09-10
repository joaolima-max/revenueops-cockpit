'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td } from '@/components/ui/DataTable'
import { formatDateTime } from '@/lib/utils'
import { CERTIFICADOS_POR_VERSAO, ENVIO_TIPO_LABELS, quantidadeDoTipo, type EnvioTipo } from '@/lib/certificados'

interface Versao {
  id: string
  identificacao: string
  descricao: string | null
  status: string
  disponiveis: number
  createdAt: string
  criadoPor: { name: string }
  documento: { id: string; nome: string } | null
  _count: { certificados: number; envios: number }
}

interface Envio {
  id: string
  tipo: EnvioTipo
  quantidade: number
  numeroInicial: number
  numeroFinal: number
  status: string
  observacao: string | null
  enviadoEm: string
  referencia: string
  cliente: { id: string; nome: string }
  versao: { id: string; identificacao: string }
  enviadoPor: { name: string }
}

interface Certificado {
  id: string
  numero: number
  status: string
  envioId: string | null
  envio: { id: string; cliente: { nome: string } } | null
}

interface ClienteOpcao { id: string; nome: string }

const STATUS_VERSAO: Record<string, { label: string; tone: BadgeTone }> = {
  ATIVA: { label: 'Ativa', tone: 'pos' },
  ESGOTADA: { label: 'Esgotada', tone: 'warn' },
  SUBSTITUIDA: { label: 'Substituída', tone: 'neutral' },
  CANCELADA: { label: 'Cancelada', tone: 'neg' },
}

export default function CertificadosClient({ podeGerenciar, podeRevelar }: {
  podeGerenciar: boolean
  podeRevelar: boolean
}) {
  const [aba, setAba] = useState<'envios' | 'versoes'>('envios')
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [criptoPronta, setCriptoPronta] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [versaoDados, setVersaoDados] = useState(0)

  const [modalEnvio, setModalEnvio] = useState(false)
  const [modalVersao, setModalVersao] = useState(false)
  const [detalhe, setDetalhe] = useState<{ versao: Versao; certificados: Certificado[] } | null>(null)

  const [formEnvio, setFormEnvio] = useState({ clienteId: '', versaoId: '', tipo: 'UNICO' as EnvioTipo, intervalo: '', observacao: '' })
  const [formVersao, setFormVersao] = useState({ identificacao: '', descricao: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [senhaRevelada, setSenhaRevelada] = useState<{ referencia: string; copiada: boolean } | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch('/api/certificados/versoes').then((r) => (r.ok ? r.json() : { versoes: [] })),
      fetch('/api/certificados/envios').then((r) => (r.ok ? r.json() : { envios: [] })),
    ]).then(([v, e]) => {
      if (!vivo) return
      setVersoes(v.versoes ?? [])
      setCriptoPronta(v.criptografiaPronta !== false)
      setEnvios(e.envios ?? [])
    }).catch(() => {}).finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [versaoDados])

  useEffect(() => {
    fetch('/api/clientes').then((r) => (r.ok ? r.json() : { clientes: [] }))
      .then((d) => setClientes(d.clientes ?? [])).catch(() => {})
  }, [])

  async function abrirDetalhe(v: Versao) {
    const res = await fetch(`/api/certificados/versoes/${v.id}`)
    if (!res.ok) return
    const d = await res.json()
    setDetalhe({ versao: v, certificados: d.certificados ?? [] })
  }

  async function criarVersao(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro('')
    const res = await fetch('/api/certificados/versoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formVersao),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível criar a versão.'); setSalvando(false); return
    }
    setModalVersao(false); setFormVersao({ identificacao: '', descricao: '' })
    setSalvando(false); setVersaoDados((v) => v + 1)
  }

  async function registrarEnvio(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro('')
    const res = await fetch('/api/certificados/envios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formEnvio),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível registrar o envio.'); setSalvando(false); return
    }
    setModalEnvio(false)
    setFormEnvio({ clienteId: '', versaoId: '', tipo: 'UNICO', intervalo: '', observacao: '' })
    setSalvando(false); setVersaoDados((v) => v + 1)
  }

  async function cancelarEnvio(env: Envio) {
    if (!confirm(`Cancelar o envio de ${env.referencia} para ${env.cliente.nome}?\n\nOs certificados voltam ao estoque. O envio fica registrado como cancelado.`)) return
    const res = await fetch(`/api/certificados/envios/${env.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELADO' }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível cancelar.'); return
    }
    setVersaoDados((v) => v + 1)
  }

  /**
   * A senha vai direto para a área de transferência e nunca é escrita na tela.
   * Só a referência do certificado fica visível como confirmação.
   */
  async function copiarSenha(cert: Certificado) {
    const res = await fetch(`/api/certificados/${cert.id}/senha`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível revelar a senha.'); return
    }
    const { senha, referencia } = await res.json()
    let copiada = false
    try {
      await navigator.clipboard.writeText(senha)
      copiada = true
    } catch { copiada = false }
    setSenhaRevelada({ referencia, copiada })
    setTimeout(() => setSenhaRevelada(null), 6000)
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  const versoesComEstoque = versoes.filter((v) => v.disponiveis > 0 && v.status !== 'CANCELADA')
  const totalEstoque = versoes.reduce((s, v) => s + v.disponiveis, 0)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gestão de Certificados"
        sub={`Estoque global: cada versão é um ZIP com ${CERTIFICADOS_POR_VERSAO} certificados numerados de 1 a ${CERTIFICADOS_POR_VERSAO}. O vínculo com o cliente acontece no envio.`}
        actions={podeGerenciar ? (
          <>
            <Button onClick={() => { setErro(''); setModalVersao(true) }}>+ Nova versão</Button>
            <Button variant="primary" onClick={() => { setErro(''); setModalEnvio(true) }}>+ Registrar envio</Button>
          </>
        ) : undefined}
      />

      {!criptoPronta && (
        <div className="bg-warn/10 border border-warn/25 text-warn px-4 py-3 rounded-xl t-sm">
          <code>CERTIFICADO_ENCRYPTION_KEY</code> não configurada. Sem ela não é possível criar
          versões nem revelar senhas.
        </div>
      )}

      {senhaRevelada && (
        <div className="bg-pos/10 border border-pos/25 text-pos px-4 py-3 rounded-xl t-sm">
          {senhaRevelada.copiada
            ? <>Senha de <strong>{senhaRevelada.referencia}</strong> copiada para a área de transferência. A revelação foi registrada na auditoria.</>
            : <>Não foi possível copiar automaticamente. Tente de novo — a senha não é exibida na tela por segurança.</>}
        </div>
      )}

      <Panel className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="t-h2 text-fg">Estoque</h2>
          <p className="t-sm text-muted mt-1 tabular-nums">
            {totalEstoque} certificado(s) disponível(is) em {versoesComEstoque.length} versão(ões) · {versoes.length} versão(ões) no total
          </p>
        </div>
      </Panel>

      <div className="flex gap-2">
        {(['envios', 'versoes'] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`px-3.5 py-2 rounded-lg t-sm font-medium border transition-colors duration-[180ms] ${
              aba === a ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-line text-muted hover:text-fg'
            }`}>
            {a === 'envios' ? 'Envios' : 'Versões'}
          </button>
        ))}
      </div>

      {carregando ? <p className="t-sm text-subtle">Carregando...</p> : aba === 'envios' ? (
        envios.length === 0 ? (
          <Panel padded={false}>
            <EmptyState title="Nenhum envio registrado"
              description="Selecione o cliente, a versão e o intervalo para registrar a entrega de certificados." />
          </Panel>
        ) : (
          <TableShell>
            <Table>
              <THead><HeadRow>
                <Th>Cliente</Th><Th>Referência</Th><Th>Tipo</Th>
                <Th align="right">Qtd.</Th><Th>Enviado</Th><Th align="right">Ações</Th>
              </HeadRow></THead>
              <tbody>
                {envios.map((e) => (
                  <Row key={e.id} className={e.status === 'CANCELADO' ? 'opacity-60' : undefined}>
                    <Td className="text-fg font-medium">{e.cliente.nome}</Td>
                    <Td>
                      {e.referencia}
                      {e.observacao && <p className="t-sm text-subtle mt-0.5">{e.observacao}</p>}
                      {e.status === 'CANCELADO' && <Badge tone="neg" className="mt-1">Cancelado</Badge>}
                    </Td>
                    <Td>{e.tipo === 'UNICO' ? 'Único' : 'Lote'}</Td>
                    <Td align="right" numeric>{e.quantidade}</Td>
                    <Td>
                      <span className="t-sm">{formatDateTime(e.enviadoEm)}</span>
                      <p className="t-label text-subtle mt-0.5">{e.enviadoPor.name}</p>
                    </Td>
                    <Td align="right">
                      {podeGerenciar && e.status !== 'CANCELADO' && (
                        <Button size="sm" variant="danger" onClick={() => cancelarEnvio(e)}>Cancelar</Button>
                      )}
                    </Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableShell>
        )
      ) : (
        versoes.length === 0 ? (
          <Panel padded={false}>
            <EmptyState title="Nenhuma versão criada"
              description={`Cada versão gera ${CERTIFICADOS_POR_VERSAO} certificados com senha própria, cifrada.`}
              action={podeGerenciar ? <Button variant="primary" onClick={() => setModalVersao(true)}>+ Nova versão</Button> : undefined} />
          </Panel>
        ) : (
          <TableShell>
            <Table>
              <THead><HeadRow>
                <Th>Versão</Th><Th align="center">Status</Th>
                <Th align="right">Disponíveis</Th><Th align="right">Envios</Th>
                <Th>Criada</Th><Th align="right">Ações</Th>
              </HeadRow></THead>
              <tbody>
                {versoes.map((v) => {
                  const s = STATUS_VERSAO[v.status] ?? STATUS_VERSAO.ATIVA
                  return (
                    <Row key={v.id}>
                      <Td className="text-fg font-medium">
                        Versão {v.identificacao}
                        {v.descricao && <p className="t-sm text-subtle font-normal mt-0.5">{v.descricao}</p>}
                      </Td>
                      <Td align="center"><Badge tone={s.tone}>{s.label}</Badge></Td>
                      <Td align="right" numeric>{v.disponiveis} / {v._count.certificados}</Td>
                      <Td align="right" numeric>{v._count.envios}</Td>
                      <Td>
                        <span className="t-sm">{formatDateTime(v.createdAt)}</span>
                        <p className="t-label text-subtle mt-0.5">{v.criadoPor.name}</p>
                      </Td>
                      <Td align="right">
                        <Button size="sm" onClick={() => abrirDetalhe(v)}>Ver certificados</Button>
                      </Td>
                    </Row>
                  )
                })}
              </tbody>
            </Table>
          </TableShell>
        )
      )}

      {/* ------------------------------------------------------ nova versão */}
      {modalVersao && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModalVersao(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Nova versão</h2>
              <button onClick={() => setModalVersao(false)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={criarVersao} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}
              <div>
                <label className={lbl} htmlFor="v-id">Identificação *</label>
                <input id="v-id" required value={formVersao.identificacao} className={inp} placeholder="Ex.: 002"
                  onChange={(e) => setFormVersao((p) => ({ ...p, identificacao: e.target.value }))} />
              </div>
              <div>
                <label className={lbl} htmlFor="v-desc">Descrição</label>
                <textarea id="v-desc" rows={2} value={formVersao.descricao} className={inp} maxLength={500}
                  onChange={(e) => setFormVersao((p) => ({ ...p, descricao: e.target.value }))} />
              </div>
              <p className="t-sm text-subtle">
                Serão gerados {CERTIFICADOS_POR_VERSAO} certificados, numerados de 1 a {CERTIFICADOS_POR_VERSAO},
                cada um com senha própria cifrada em AES-256-GCM.
              </p>
              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModalVersao(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>{salvando ? 'Criando...' : 'Criar versão'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- registrar envio */}
      {modalEnvio && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModalEnvio(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Registrar envio</h2>
              <button onClick={() => setModalEnvio(false)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={registrarEnvio} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

              <div>
                <label className={lbl} htmlFor="e-cliente">Cliente *</label>
                <select id="e-cliente" required value={formEnvio.clienteId} className={inp}
                  onChange={(e) => setFormEnvio((p) => ({ ...p, clienteId: e.target.value }))}>
                  <option value="">Selecione o cliente</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="e-versao">Versão *</label>
                <select id="e-versao" required value={formEnvio.versaoId} className={inp}
                  onChange={(e) => setFormEnvio((p) => ({ ...p, versaoId: e.target.value }))}>
                  <option value="">Selecione a versão</option>
                  {versoesComEstoque.map((v) => (
                    <option key={v.id} value={v.id}>Versão {v.identificacao} — {v.disponiveis} disponível(is)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="e-tipo">Tipo de envio *</label>
                <select id="e-tipo" value={formEnvio.tipo} className={inp}
                  onChange={(e) => setFormEnvio((p) => ({ ...p, tipo: e.target.value as EnvioTipo, intervalo: '' }))}>
                  {(['UNICO', 'LOTE'] as EnvioTipo[]).map((t) => (
                    <option key={t} value={t}>{ENVIO_TIPO_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="e-int">Número ou intervalo *</label>
                <input id="e-int" required value={formEnvio.intervalo} className={inp}
                  placeholder={formEnvio.tipo === 'UNICO' ? 'Ex.: 11' : 'Ex.: 1 - 10'}
                  onChange={(e) => setFormEnvio((p) => ({ ...p, intervalo: e.target.value }))} />
                <p className="t-sm text-subtle mt-1">
                  {quantidadeDoTipo(formEnvio.tipo)} certificado(s). A numeração é relativa à versão:
                  1–{CERTIFICADOS_POR_VERSAO} existe em cada uma.
                </p>
              </div>

              <div>
                <label className={lbl} htmlFor="e-obs">Observação</label>
                <input id="e-obs" value={formEnvio.observacao} className={inp} maxLength={500}
                  onChange={(e) => setFormEnvio((p) => ({ ...p, observacao: e.target.value }))} />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModalEnvio(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Registrar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- detalhe da versão */}
      {detalhe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setDetalhe(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line flex-none">
              <div>
                <h2 className="t-h2 text-fg">Versão {detalhe.versao.identificacao}</h2>
                <p className="t-sm text-muted mt-0.5">
                  {detalhe.certificados.filter((c) => !c.envioId).length} em estoque de {detalhe.certificados.length}
                </p>
              </div>
              <button onClick={() => setDetalhe(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <div className="p-5 overflow-y-auto">
              <PanelHeader title="Certificados" sub="A senha nunca aparece na tela — é copiada direto para a área de transferência, e a revelação fica na auditoria." />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                {detalhe.certificados.map((c) => (
                  <div key={c.id} className="border border-line rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="t-sm font-medium text-fg tabular-nums">Nº {c.numero}</p>
                      <p className="t-label text-subtle truncate">
                        {c.envio ? c.envio.cliente.nome : 'em estoque'}
                      </p>
                    </div>
                    {podeRevelar && (
                      <Button size="sm" variant="subtle" onClick={() => copiarSenha(c)}>Copiar senha</Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 border-t border-line flex justify-end flex-none">
              <Button onClick={() => setDetalhe(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
