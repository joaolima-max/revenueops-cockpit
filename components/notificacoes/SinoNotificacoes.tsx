'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
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

/**
 * Sino do Topbar. Faz uma leitura ao montar e volta a cada 60s — intervalo
 * escolhido para não transformar cada aba aberta num gerador de carga.
 */
export default function SinoNotificacoes() {
  const [itens, setItens] = useState<Notificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [aberto, setAberto] = useState(false)
  const [versao, setVersao] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    const buscar = () => {
      fetch('/api/notificacoes?limite=8')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo || !d) return
          setItens(d.notificacoes ?? [])
          setNaoLidas(d.naoLidas ?? 0)
        })
        .catch(() => {})
    }
    buscar()
    const id = setInterval(buscar, 60_000)
    return () => { vivo = false; clearInterval(id) }
  }, [versao])

  // Fecha ao clicar fora ou no Esc — um painel preso aberto atrapalha a navegação.
  useEffect(() => {
    if (!aberto) return
    const clique = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', clique)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', clique)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const marcarLida = useCallback(async (id: string) => {
    setItens((p) => p.map((n) => (n.id === id ? { ...n, lidaEm: new Date().toISOString() } : n)))
    setNaoLidas((n) => Math.max(0, n - 1))
    await fetch(`/api/notificacoes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lida: true }),
    }).catch(() => {})
  }, [])

  async function marcarTodas() {
    setNaoLidas(0)
    setItens((p) => p.map((n) => ({ ...n, lidaEm: n.lidaEm ?? new Date().toISOString() })))
    await fetch('/api/notificacoes/ler-todas', { method: 'POST' }).catch(() => {})
    setVersao((v) => v + 1)
  }

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={() => setAberto((a) => !a)}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
        aria-expanded={aberto}
        className="relative p-2 rounded-lg text-muted hover:text-fg hover:bg-white/[0.06] transition-colors duration-[180ms]"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-surface border border-line-2 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="t-sm font-semibold text-fg">Notificações</span>
            {naoLidas > 0 && (
              <button onClick={marcarTodas} className="t-label text-accent-soft hover:text-accent">
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {itens.length === 0 ? (
              <p className="px-4 py-8 text-center t-sm text-subtle">Nenhuma notificação.</p>
            ) : itens.map((n) => {
              const conteudo = (
                <div className={`px-4 py-3 border-b border-line/60 last:border-0 transition-colors duration-[180ms] hover:bg-surface-2 ${n.lidaEm ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    {!n.lidaEm && <span aria-hidden className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-none" />}
                    <div className="min-w-0">
                      <p className="t-sm font-medium text-fg">{n.titulo}</p>
                      <p className="t-sm text-muted mt-0.5">{n.mensagem}</p>
                      <p className="t-label text-subtle mt-1">{formatDateTime(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              )
              return n.href ? (
                <Link key={n.id} href={n.href} onClick={() => { marcarLida(n.id); setAberto(false) }} className="block">
                  {conteudo}
                </Link>
              ) : (
                <button key={n.id} onClick={() => marcarLida(n.id)} className="block w-full text-left">
                  {conteudo}
                </button>
              )
            })}
          </div>

          <Link
            href="/dashboard/notificacoes"
            onClick={() => setAberto(false)}
            className="block px-4 py-3 border-t border-line t-sm text-accent-soft hover:text-accent hover:bg-surface-2 transition-colors duration-[180ms] text-center"
          >
            Ver todas
          </Link>
        </div>
      )}
    </div>
  )
}
