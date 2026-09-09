export const dynamic = 'force-dynamic'

import Link from 'next/link'

const REPORTS = [
  {
    id: 'conselho',
    title: 'Relatório do Conselho',
    audience: 'Conselho / C-Level',
    description: 'Visão estratégica exclusiva. Receita, TPV, MRR, margens, forecast, riscos, oportunidades e top clientes.',
    metrics: ['Receita & TPV', 'MRR & Margem', 'Forecast', 'Top Clientes', 'Riscos'],
    confidential: true,
  },
  {
    id: 'financeiro',
    title: 'Relatório Financeiro',
    audience: 'CFO / Financeiro',
    description: 'Receitas detalhadas, floating, MRR, contas a receber, inadimplência, margens e precisão do forecast.',
    metrics: ['Receitas', 'Floating', 'Inadimplência', 'Precisão Forecast', 'Margens'],
    confidential: true,
  },
  {
    id: 'comercial',
    title: 'Relatório Comercial',
    audience: 'CCO / Vendas',
    description: 'Pipeline, conversão, novos clientes, receita gerada, LTV/CAC, metas e forecast comercial.',
    metrics: ['Pipeline', 'Conversão', 'LTV/CAC', 'Metas', 'Forecast Comercial'],
    confidential: false,
  },
  {
    id: 'metas',
    title: 'Relatório de Metas',
    audience: 'Gestão / Board',
    description: 'Acompanhamento de todas as metas com realizado, gap, percentual de atingimento, histórico e projeção.',
    metrics: ['Meta vs Realizado', 'Gap & %', 'Histórico', 'Projeção'],
    confidential: false,
  },
  {
    id: 'institucional',
    title: 'Relatório Institucional',
    audience: 'Investidores / Board',
    description: 'Documento para investidores. Crescimento histórico, carteira, distribuição, concentração e indicadores.',
    metrics: ['Crescimento', 'Carteira', 'Distribuição', 'Indicadores Históricos'],
    confidential: true,
  },
  {
    id: 'operacional',
    title: 'Relatório Operacional',
    audience: 'COO / Operações',
    description: 'Incidentes, SLA, MED, volume processado, alertas de clientes abaixo do mínimo e eficiência operacional.',
    metrics: ['Incidentes', 'SLA', 'Alertas', 'MED', 'Eficiência'],
    confidential: false,
  },
]

export default function RelatoriosPage() {
  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h1 className="t-h1 text-fg">Relatórios Executivos</h1>
        <p className="text-subtle text-sm mt-1">Cada relatório é preparado para um público específico · Exportáveis em PDF · Prontos para impressão A4</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {REPORTS.map(r => (
          <div key={r.id} className="bg-surface border border-line rounded-xl overflow-hidden flex flex-col hover:border-line-2 transition-colors">
            <div className="h-1 bg-accent" aria-hidden />
            <div className="p-5 flex flex-col flex-1">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="t-h3 text-fg">{r.title}</h2>
                {r.confidential && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-neg/10 text-neg border border-neg/20 flex-shrink-0 font-semibold tracking-wide">CONF.</span>
                )}
              </div>
              <p className="text-[11px] text-subtle mb-4 leading-relaxed">{r.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-5">
                {r.metrics.map(m => (
                  <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line-2">{m}</span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between">
                <span className="text-[10px] text-subtle">{r.audience}</span>
                <Link
                  href={`/dashboard/relatorios/${r.id}`}
                  className="bp-btn-primary px-3 py-1.5 text-xs font-medium rounded-lg"
                >
                  Abrir Relatório →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-line">
        <div className="flex items-center justify-between">
          <p className="text-xs text-subtle">Analytics consolidado com gráficos interativos</p>
          <Link href="/dashboard/relatorios/analitico" className="text-xs text-subtle hover:text-muted transition-colors">
            Relatório Analítico →
          </Link>
        </div>
      </div>
    </div>
  )
}
