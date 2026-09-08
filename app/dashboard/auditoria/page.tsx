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
        <h1 className="text-lg font-bold text-white">Auditoria</h1>
        <p className="text-gray-600 text-sm mt-0.5">Registro de ações no sistema — últimos 200 eventos</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Eventos', value: String(logs.length), color: 'text-white' },
          { label: 'Entidades', value: String(entidades.length), color: 'text-sky-400' },
          { label: 'Usuários Ativos', value: String(new Set(logs.map(l => l.userId)).size), color: 'text-emerald-400' },
          { label: 'Hoje', value: String(logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length), color: 'text-violet-400' },
        ].map(k => (
          <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-600 text-xs mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Data/Hora', 'Usuário', 'Ação', 'Entidade', 'ID', 'Detalhes'].map(h => (
                <th key={h} className="text-xs font-medium text-gray-600 px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-2.5 text-gray-300">{log.user.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    log.acao.includes('DELETE') || log.acao.includes('EXCLUIU') ? 'bg-red-500/10 text-red-400' :
                    log.acao.includes('CREATE') || log.acao.includes('CRIOU') ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-sky-500/10 text-sky-400'
                  }`}>{log.acao}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-400">{log.entidade}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs font-mono">{log.entidadeId?.substring(0, 8) || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs max-w-xs truncate">{log.detalhes || '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-600">Nenhum registro de auditoria</td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
