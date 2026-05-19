'use client'

import { useState } from 'react'
import { formatCurrency, DEAL_STAGE_LABELS } from '@/lib/utils'

interface Deal {
  id: string
  title: string
  value: number
  stage: string
  probability: number
  owner: { name: string }
  lead: { name: string; company: string | null } | null
}

const STAGES = ['PROSPECCAO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'FECHAMENTO']

const STAGE_COLORS: Record<string, string> = {
  PROSPECCAO: 'border-gray-300 bg-gray-50',
  QUALIFICACAO: 'border-blue-300 bg-blue-50',
  PROPOSTA: 'border-yellow-300 bg-yellow-50',
  NEGOCIACAO: 'border-orange-300 bg-orange-50',
  FECHAMENTO: 'border-purple-300 bg-purple-50',
}

const CARD_COLORS: Record<string, string> = {
  PROSPECCAO: 'border-l-gray-400',
  QUALIFICACAO: 'border-l-blue-400',
  PROPOSTA: 'border-l-yellow-400',
  NEGOCIACAO: 'border-l-orange-400',
  FECHAMENTO: 'border-l-purple-500',
}

export default function PipelineClient({ deals: initialDeals }: { deals: Deal[] }) {
  const [deals, setDeals] = useState(initialDeals)
  const [dragging, setDragging] = useState<string | null>(null)

  async function moveDeal(dealId: string, newStage: string) {
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d))
    )
    await fetch(`/api/deals/${dealId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
  }

  function onDragStart(dealId: string) {
    setDragging(dealId)
  }

  function onDrop(stage: string) {
    if (dragging) {
      moveDeal(dragging, stage)
      setDragging(null)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <p className="text-gray-500 text-sm mt-1">Arraste os negócios para mover entre estágios</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage)
          const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0)

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-72 rounded-xl border-2 ${STAGE_COLORS[stage]} p-4`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage)}
            >
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700">{DEAL_STAGE_LABELS[stage]}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {stageDeals.length} negócio(s) · {formatCurrency(stageTotal)}
                </p>
              </div>

              <div className="space-y-3">
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => onDragStart(deal.id)}
                    className={`bg-white rounded-lg border border-gray-200 border-l-4 ${CARD_COLORS[deal.stage]} p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow`}
                  >
                    <p className="text-sm font-medium text-gray-900 leading-tight">{deal.title}</p>
                    {deal.lead && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {deal.lead.company || deal.lead.name}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(deal.value)}
                      </span>
                      <span className="text-xs text-gray-400">{deal.probability}%</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{deal.owner.name}</p>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-400">Solte aqui</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
