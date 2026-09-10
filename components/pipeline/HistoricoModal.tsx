'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import type { Card } from './tipos'

interface Movimentacao {
  id: string
  tipo: 'CRIACAO' | 'MOVIMENTO_ETAPA' | 'TRANSFERENCIA_FUNIL'
  observacao: string | null
  createdAt: string
  user: { name: string }
  funilOrigem: { nome: string } | null
  etapaOrigem: { nome: string } | null
  funilDestino: { nome: string }
  etapaDestino: { nome: string }
}

const TIPO: Record<Movimentacao['tipo'], { label: string; tone: BadgeTone }> = {
  CRIACAO: { label: 'Criação', tone: 'neutral' },
  MOVIMENTO_ETAPA: { label: 'Movimento', tone: 'accent' },
  TRANSFERENCIA_FUNIL: { label: 'Transferência', tone: 'warn' },
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function HistoricoModal({ card, onFechar }: { card: Card; onFechar: () => void }) {
  const [itens, setItens] = useState<Movimentacao[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    fetch(`/api/pipeline/cards/${card.id}/historico`)
      .then((r) => (r.ok ? r.json() : { historico: [] }))
      .then((d) => { if (vivo) setItens(d.historico ?? []) })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [card.id])

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-line flex-none">
          <div className="min-w-0">
            <h2 className="t-h2 text-fg">Histórico</h2>
            <p className="t-sm text-muted mt-0.5 truncate">{card.title}</p>
          </div>
          <button onClick={onFechar} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {carregando ? (
            <p className="t-sm text-subtle">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="t-sm text-subtle">
              Nenhuma movimentação registrada. Cards anteriores ao pipeline multi-funil só passam a
              gravar histórico a partir da próxima movimentação.
            </p>
          ) : (
            <ol className="space-y-4">
              {itens.map((m) => {
                const t = TIPO[m.tipo]
                return (
                  <li key={m.id} className="border-l border-line pl-4 relative">
                    <span aria-hidden className="absolute -left-[3px] top-1.5 w-[5px] h-[5px] rotate-45 rounded-[1px] bg-subtle" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={t.tone}>{t.label}</Badge>
                      <span className="t-label text-subtle">{QUANDO.format(new Date(m.createdAt))}</span>
                    </div>
                    <p className="t-sm text-fg mt-1.5">
                      {m.funilOrigem
                        ? <>{m.funilOrigem.nome} / {m.etapaOrigem?.nome ?? '—'} → {m.funilDestino.nome} / {m.etapaDestino.nome}</>
                        : <>Criado em {m.funilDestino.nome} / {m.etapaDestino.nome}</>}
                    </p>
                    <p className="t-label text-subtle mt-0.5">por {m.user.name}</p>
                    {m.observacao && <p className="t-sm text-muted mt-1">{m.observacao}</p>}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="p-5 border-t border-line flex justify-end flex-none">
          <Button onClick={onFechar}>Fechar</Button>
        </div>
      </div>
    </div>
  )
}
