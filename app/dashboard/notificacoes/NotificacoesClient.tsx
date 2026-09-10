'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { formatDateTime } from '@/lib/utils'

interface Notificacao {
  id: string
  titulo: string
  mensagem: string
  origem: string
  href: string | null
  lidaEm: string | null
  createdAt: string
}

const ORIGEM: Record<string, { label: string; tone: BadgeTone }> = {
  PIPELINE: { label: 'Pipeline', tone: 'accent' },
  AUTOMACAO: { label: 'Automação', tone: 'accent' },
  COMPLIANCE: { label: 'Compliance', tone: 'warn' },
  FORMULARIO: { label: 'Formulário', tone: 'neutral' },
  CERTIFICADO: { label: 'Certificado', tone: 'neutral' },
  SISTEMA: { label: 'Sistema', tone: 'neutral' },
}

export default function NotificacoesClient() {
  const [itens, setItens] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch(`/api/notificacoes?limite=100${apenasNaoLidas ? '&naoLidas=1' : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setItens(d.notificacoes ?? [])
        setNaoLidas(d.naoLidas ?? 0)
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [apenasNaoLidas, versao])

  async function alternarLida(n: Notificacao) {
    await fetch(`/api/notificacoes/${n.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lida: !n.lidaEm }),
    })
    setVersao((v) => v + 1)
  }

  async function marcarTodas() {
    await fetch('/api/notificacoes/ler-todas', { method: 'POST' })
    setVersao((v) => v + 1)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notificações"
        sub="Mensagens dirigidas a você. Não se confundem com Alertas, que são verificações operacionais do sistema."
        actions={
          <>
            <Button onClick={() => setApenasNaoLidas((v) => !v)}>
              {apenasNaoLidas ? 'Ver todas' : 'Só não lidas'}
            </Button>
            {naoLidas > 0 && <Button variant="primary" onClick={marcarTodas}>Marcar todas como lidas</Button>}
          </>
        }
      />

      {carregando ? (
        <p className="t-sm text-subtle">Carregando...</p>
      ) : itens.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title={apenasNaoLidas ? 'Nenhuma notificação não lida' : 'Nenhuma notificação'}
            description="Transferências de card, pendências de compliance e automações aparecem aqui."
          />
        </Panel>
      ) : (
        <div className="space-y-2">
          {itens.map((n) => {
            const o = ORIGEM[n.origem] ?? ORIGEM.SISTEMA
            return (
              <Panel key={n.id} className={`flex items-start justify-between gap-4 flex-wrap ${n.lidaEm ? 'opacity-65' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {!n.lidaEm && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-accent flex-none" />}
                    <h3 className="t-body font-medium text-fg">{n.titulo}</h3>
                    <Badge tone={o.tone}>{o.label}</Badge>
                  </div>
                  <p className="t-sm text-muted mt-1.5">{n.mensagem}</p>
                  <p className="t-label text-subtle mt-1.5">{formatDateTime(n.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  {n.href && <Link href={n.href}><Button size="sm">Abrir contexto</Button></Link>}
                  <Button size="sm" variant="subtle" onClick={() => alternarLida(n)}>
                    {n.lidaEm ? 'Marcar não lida' : 'Marcar lida'}
                  </Button>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
