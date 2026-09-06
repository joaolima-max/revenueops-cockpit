export type InsightType = 'positive' | 'negative' | 'warning' | 'neutral'

export interface Insight {
  id: string
  text: string
  type: InsightType
}

function fmt(n: number, d = 1): string {
  return n.toFixed(d).replace('.', ',')
}

function pct(atual: number, prev: number): number {
  if (prev === 0) return 0
  return ((atual - prev) / prev) * 100
}

export function ruleReceitaMoM(recAtual: number, recPrev: number): Insight | null {
  if (recAtual <= 0 || recPrev <= 0) return null
  const delta = pct(recAtual, recPrev)
  if (Math.abs(delta) < 0.5) return null
  const sinal = delta > 0 ? 'aumentou' : 'caiu'
  const tipo: InsightType = delta > 0 ? 'positive' : 'negative'
  return { id: 'receita-mom', text: `A Receita ${sinal} ${fmt(Math.abs(delta))}% em relação ao mês anterior.`, type: tipo }
}




export function ruleFloatTrend(floats: number[]): Insight | null {
  if (floats.length < 3) return null
  const last3 = floats.slice(-3)
  if (last3.some(v => v <= 0)) return null
  if (last3[0] > last3[1] && last3[1] > last3[2]) return { id: 'float-trend', text: 'O Float caiu nos últimos 3 meses consecutivos.', type: 'warning' }
  if (last3[0] < last3[1] && last3[1] < last3[2]) return { id: 'float-trend', text: 'O Float cresceu nos últimos 3 meses consecutivos.', type: 'positive' }
  return null
}


export function ruleInadimplencia(clientesCount: number): Insight | null {
  if (clientesCount === 0) return null
  return { id: 'inadimplencia', text: `${clientesCount} cliente${clientesCount > 1 ? 's' : ''} com cobrança em aberto no mês.`, type: clientesCount >= 3 ? 'negative' : 'warning' }
}

export function ruleNovosClientes(count: number): Insight | null {
  if (count === 0) return null
  return { id: 'novos-clientes', text: `${count} novo${count > 1 ? 's cliente' : ' cliente'} fechado${count > 1 ? 's' : ''} no mês.`, type: 'positive' }
}

export function ruleChurn(count: number): Insight | null {
  if (count === 0) return null
  return { id: 'churn', text: `${count} cliente${count > 1 ? 's' : ''} encerrado${count > 1 ? 's' : ''} no mês.`, type: count >= 2 ? 'negative' : 'warning' }
}

export function ruleTakeRateMoM(trAtual: number | null, trPrev: number | null): Insight | null {
  if (trAtual === null || trPrev === null) return null
  const delta = trAtual - trPrev
  if (Math.abs(delta) < 0.01) return null
  const sinal = delta > 0 ? 'subiu' : 'caiu'
  return {
    id: 'takerate-mom',
    text: `O Take Rate ${sinal} ${fmt(Math.abs(delta), 2)} p.p. em relação ao mês anterior.`,
    type: delta > 0 ? 'positive' : 'warning',
  }
}

export function ruleVolumetria(
  status: string, qtdMinima: number, realizado: number | null
): Insight | null {
  if (status === 'SEM_DADOS' || realizado === null) return null
  if (status === 'ATINGIDO') {
    return { id: 'volumetria', text: `Volumetria mínima atingida: ${realizado.toLocaleString('pt-BR')} de ${qtdMinima.toLocaleString('pt-BR')} transações.`, type: 'positive' }
  }
  const falta = qtdMinima - realizado
  return {
    id: 'volumetria',
    text: status === 'EM_ACOMPANHAMENTO'
      ? `Faltam ${falta.toLocaleString('pt-BR')} transações para a volumetria mínima do mês.`
      : `Volumetria mínima não atingida: faltaram ${falta.toLocaleString('pt-BR')} transações.`,
    type: status === 'EM_ACOMPANHAMENTO' ? 'warning' : 'negative',
  }
}

export function ruleDiasSemLancamento(diasLancados: number, diasDecorridos: number): Insight | null {
  const faltando = diasDecorridos - diasLancados
  if (faltando < 1) return null
  return {
    id: 'lancamentos-pendentes',
    text: `${faltando} ${faltando === 1 ? 'dia sem lançamento' : 'dias sem lançamento'} no mês corrente.`,
    type: faltando >= 3 ? 'warning' : 'neutral',
  }
}
