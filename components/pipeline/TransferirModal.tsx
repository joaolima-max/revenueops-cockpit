'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import type { Card, FunilResumo, EtapaResumo } from './tipos'

interface ClienteOpcao { id: string; nome: string }

/**
 * Transferir → funil → etapa → cliente (se o funil exigir) → confirmar.
 * Quatro passos numa tela só; a validação de verdade acontece no servidor.
 */
export default function TransferirModal({ card, funilAtual, onFechar, onTransferido }: {
  card: Card
  funilAtual: FunilResumo
  onFechar: () => void
  onTransferido: () => void
}) {
  const [funis, setFunis] = useState<FunilResumo[]>([])
  const [etapas, setEtapas] = useState<EtapaResumo[]>([])
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])

  const [funilId, setFunilId] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [clienteId, setClienteId] = useState(card.cliente?.id ?? '')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Só faz sentido oferecer funis em que o usuário pode criar: transferir é
  // também criar no destino.
  useEffect(() => {
    let vivo = true
    fetch('/api/pipeline/funis')
      .then((r) => (r.ok ? r.json() : { funis: [] }))
      .then((d) => {
        if (!vivo) return
        setFunis((d.funis ?? []).filter((f: FunilResumo) => f.id !== funilAtual.id && f.ativo && f.acesso.criar))
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [funilAtual.id])

  // A limpeza ao trocar de funil acontece no onChange do select, nao aqui:
  // zerar estado no corpo do efeito dispara uma renderizacao em cascata.
  useEffect(() => {
    if (!funilId) return
    let vivo = true
    fetch(`/api/pipeline/funis/${funilId}/etapas`)
      .then((r) => (r.ok ? r.json() : { etapas: [] }))
      .then((d) => {
        if (!vivo) return
        const ativas = (d.etapas ?? []).filter((e: EtapaResumo) => e.ativo)
        setEtapas(ativas)
        setEtapaId(ativas[0]?.id ?? '')
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [funilId])

  const destino = funis.find((f) => f.id === funilId)
  const precisaCliente = !!destino?.exigeCliente

  useEffect(() => {
    if (!precisaCliente || clientes.length > 0) return
    let vivo = true
    fetch('/api/clientes')
      .then((r) => (r.ok ? r.json() : { clientes: [] }))
      .then((d) => { if (vivo) setClientes(d.clientes ?? []) })
      .catch(() => {})
    return () => { vivo = false }
  }, [precisaCliente, clientes.length])

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const res = await fetch(`/api/pipeline/cards/${card.id}/transferir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funilId, etapaId, clienteId: clienteId || null, observacao: observacao || null }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível transferir o card.')
      setSalvando(false)
      return
    }
    onTransferido()
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="min-w-0">
            <h2 className="t-h2 text-fg">Transferir card</h2>
            <p className="t-sm text-muted mt-0.5 truncate">{card.title} · de {funilAtual.nome}</p>
          </div>
          <button onClick={onFechar} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
        </div>

        <form onSubmit={confirmar} className="p-5 space-y-4">
          {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

          {funis.length === 0 ? (
            <p className="t-sm text-subtle">
              Não há outro funil ativo em que você possa criar cards.
            </p>
          ) : (
            <>
              <div>
                <label className={lbl} htmlFor="tr-funil">Funil de destino *</label>
                <select id="tr-funil" required value={funilId} className={inp}
                  onChange={(e) => { setFunilId(e.target.value); setEtapas([]); setEtapaId(''); setErro('') }}>
                  <option value="">Selecione o funil</option>
                  {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="tr-etapa">Etapa inicial *</label>
                <select id="tr-etapa" required value={etapaId} disabled={!funilId} className={`${inp} disabled:opacity-50`}
                  onChange={(e) => setEtapaId(e.target.value)}>
                  {etapas.length === 0 && <option value="">Escolha um funil primeiro</option>}
                  {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>

              {precisaCliente && (
                <div>
                  <label className={lbl} htmlFor="tr-cliente">Cliente *</label>
                  <select id="tr-cliente" required value={clienteId} className={inp}
                    onChange={(e) => setClienteId(e.target.value)}>
                    <option value="">Selecione o cliente</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <p className="t-sm text-subtle mt-1">O funil {destino?.nome} exige um cliente vinculado.</p>
                </div>
              )}

              <div>
                <label className={lbl} htmlFor="tr-obs">Observação</label>
                <textarea id="tr-obs" rows={2} maxLength={500} value={observacao} className={inp}
                  onChange={(e) => setObservacao(e.target.value)} />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={salvando || !funilId || !etapaId}>
              {salvando ? 'Transferindo...' : 'Confirmar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
