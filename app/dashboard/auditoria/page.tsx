export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'

export default async function AuditoriaPage() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/dashboard')

  const logs = await prisma.auditoria.findMany({
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const entidades = [...new Set(logs.map(l => l.entidade))]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="t-h1 text-fg">Auditoria</h1>
        <p className="text-subtle text-sm mt-0.5">Registro de ações no sistema — últimos 200 eventos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Eventos', value: String(logs.length), color: 'text-fg' },
          { label: 'Entidades', value: String(entidades.length), color: 'text-accent-soft' },
          { label: 'Usuários Ativos', value: String(new Set(logs.map(l => l.userId)).size), color: 'text-pos' },
          { label: 'Hoje', value: String(logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length), color: 'text-accent-soft' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-line rounded-xl p-4">
            <p className="text-subtle text-xs mb-1">{k.label}</p>
            <p className={`text-xl font-bold tnum ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-line">
              {['Data/Hora', 'Usuário', 'Ação', 'Entidade', 'ID', 'Detalhes'].map(h => (
                <th key={h} className="t-label text-subtle px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-line hover:bg-[var(--bp-hover)]">
                <td className="px-4 py-2.5 text-subtle text-xs whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-2.5 text-muted">{log.user.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    log.acao.includes('DELETE') || log.acao.includes('EXCLUIU') ? 'bg-neg/10 text-neg' :
                    log.acao.includes('CREATE') || log.acao.includes('CRIOU') ? 'bg-pos/10 text-pos' :
                    'bg-accent/10 text-accent-soft'
                  }`}>{log.acao}</span>
                </td>
                <td className="px-4 py-2.5 text-muted">{log.entidade}</td>
                <td className="px-4 py-2.5 text-subtle text-xs font-mono">{log.entidadeId?.substring(0, 8) || '—'}</td>
                <td className="px-4 py-2.5 text-subtle text-xs max-w-xs truncate">{log.detalhes || '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-subtle">Nenhum registro de auditoria</td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
